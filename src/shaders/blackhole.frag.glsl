// Black hole gravitational lensing ray marching shader
// Implements Schwarzschild metric geodesic integration for photon paths
// with accretion disk, Einstein ring, and procedural star field

precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uMass;           // Schwarzschild radius scale (0.5 - 5.0)
uniform float uSpin;           // Kerr spin parameter a/M (0.0 - 0.998)
uniform float uShowDisk;       // 0 or 1 — toggle accretion disk
uniform vec2 uResolution;
uniform mat4 uCameraMatrix;    // inverse view matrix (camera world transform)
uniform float uFov;            // camera FOV in radians

// AR mode — camera feed as background
uniform sampler2D uBackground; // Camera feed texture (or empty)
uniform float uUseCamera;      // 0.0 = procedural stars, 1.0 = camera feed
uniform float uMirrorX;        // 1.0 = mirror X (front camera), 0.0 = no mirror (rear)
uniform mat4 uInvCameraMatrix; // Inverse of uCameraMatrix (computed in JS)

// Starfield texture
uniform sampler2D uStarfield;  // Equirectangular panorama texture
uniform float uUseStarfield;   // 0.0 = procedural, 1.0 = texture

const float PI = 3.14159265359;
const float MAX_DIST = 100.0;
const int MAX_STEPS = 200;

// ─── Procedural star field ──────────────────────────────────────────

// Hash function for procedural noise
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Star field: returns brightness for a given ray direction
float starField(vec3 dir) {
  // Convert to spherical coordinates for tiling
  float phi = atan(dir.z, dir.x);
  float theta = acos(clamp(dir.y, -1.0, 1.0));

  // Multiple star layers at different scales
  float stars = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float scale = 80.0 + float(layer) * 60.0;
    vec2 grid = vec2(phi, theta) * scale;
    vec2 cell = floor(grid);
    vec2 frac_ = fract(grid);

    float h = hash(cell + float(layer) * 100.0);
    if (h > 0.97) {
      // Star center offset within cell
      vec2 center = vec2(hash(cell * 1.7 + 0.3), hash(cell * 2.3 + 0.7));
      float d = length(frac_ - center);
      float brightness = smoothstep(0.08, 0.0, d) * (0.5 + 0.5 * hash(cell * 3.1));
      stars += brightness;
    }
  }

  // Milky Way band
  float band = exp(-8.0 * (dir.y * dir.y));
  stars += band * 0.03;

  return stars;
}

// ─── Kerr metric helpers ────────────────────────────────────────────

// Compute ISCO radius for Kerr metric (prograde orbit)
float computeISCO(float rs, float spin) {
  float M = rs * 0.5;
  if (spin < 0.001) return 3.0 * rs;  // Schwarzschild ISCO = 6M = 3rs
  float s2 = spin * spin;
  float z1 = 1.0 + pow(1.0 - s2, 1.0 / 3.0) *
    (pow(1.0 + spin, 1.0 / 3.0) + pow(max(1.0 - spin, 0.001), 1.0 / 3.0));
  float z2 = sqrt(3.0 * s2 + z1 * z1);
  float iscoOverM = 3.0 + z2 - sqrt((3.0 - z1) * (3.0 + z1 + 2.0 * z2));
  return M * iscoOverM;
}

// Compute prograde photon sphere radius for Kerr metric
float computePhotonSphere(float rs, float spin) {
  float M = rs * 0.5;
  return 2.0 * M * (1.0 + cos(2.0 / 3.0 * acos(clamp(-spin, -1.0, 1.0))));
}

// ─── Accretion disk ─────────────────────────────────────────────────

// Temperature-based coloring with Doppler beaming
// pos: disk-plane position, viewDir: ray direction at hit point
vec3 diskColor(float r, float rs, vec3 pos, vec3 viewDir) {
  float innerEdge = computeISCO(rs, uSpin);
  float outerEdge = rs * 15.0;
  float M = rs * 0.5;

  // Normalized radius within disk
  float t = clamp((r - innerEdge) / (outerEdge - innerEdge), 0.0, 1.0);

  // Temperature profile: T ~ r^(-3/4) for thin disk
  // Boost temperature at high spin: smaller ISCO → hotter peak
  float schwarzISCO = 3.0 * rs;  // ISCO at a=0
  float spinTempBoost = schwarzISCO / max(innerEdge, 0.01);  // >1 at high spin
  float temp = pow(1.0 - t, 0.75) * clamp(spinTempBoost, 1.0, 3.0);
  temp = clamp(temp, 0.0, 1.0);

  // Color palette: shifted bluer at high spin
  vec3 hot = vec3(0.7, 0.8, 1.0);
  vec3 warm = mix(vec3(1.0, 0.6, 0.2), vec3(0.8, 0.75, 1.0), uSpin * 0.5);
  vec3 cool = vec3(0.8, 0.2, 0.05);

  vec3 color;
  if (temp > 0.5) {
    color = mix(warm, hot, (temp - 0.5) * 2.0);
  } else {
    color = mix(cool, warm, temp * 2.0);
  }

  // ─── Relativistic Doppler beaming ──────────────────────────────
  // Prograde orbital velocity: v_phi = sqrt(M/r) / (1 + a*sqrt(M/r^3))
  float sqrtMr = sqrt(M / r);
  float vPhi = sqrtMr / (1.0 + uSpin * sqrt(M / (r * r * r)));

  // Orbital velocity vector (tangent to circular orbit in equatorial plane)
  // For prograde orbit around +Y axis: v = vPhi * (-sin(phi), 0, cos(phi))
  float phi = atan(pos.z, pos.x);
  vec3 vOrbit = vPhi * vec3(-sin(phi), 0.0, cos(phi));

  // Doppler factor: delta = 1 / (gamma * (1 - v . n_hat))
  float v2 = vPhi * vPhi;
  float gamma = 1.0 / sqrt(max(1.0 - v2, 0.001));
  float vDotN = dot(vOrbit, normalize(viewDir));
  float doppler = 1.0 / (gamma * (1.0 - vDotN));
  doppler = clamp(doppler, 0.2, 5.0);  // prevent extreme values

  // Apply Doppler: intensity scales as delta^3, color shifts
  float dopplerIntensity = doppler * doppler * doppler;

  // Doppler color shift: blueshifted (approaching) vs redshifted (receding)
  vec3 dopplerColor = color;
  if (doppler > 1.0) {
    // Approaching: shift toward blue-white
    float blueShift = clamp((doppler - 1.0) * 0.5, 0.0, 1.0);
    dopplerColor = mix(color, vec3(0.8, 0.85, 1.0), blueShift);
  } else {
    // Receding: shift toward red
    float redShift = clamp((1.0 - doppler) * 0.5, 0.0, 1.0);
    dopplerColor = mix(color, vec3(1.0, 0.3, 0.1), redShift);
  }

  // Time-varying brightness (retained from original)
  float brightness = 1.0 + 0.3 * sin(uTime * 0.5);

  // Radial brightness falloff
  float falloff = smoothstep(outerEdge, innerEdge, r);

  return dopplerColor * falloff * brightness * dopplerIntensity * 2.5;
}

// Check if ray hits the thin accretion disk (y ≈ 0 plane)
bool hitDisk(vec3 pos, float rs, vec3 viewDir, out vec3 color) {
  float r = length(pos);
  float innerEdge = computeISCO(rs, uSpin);
  float outerEdge = rs * 15.0;

  if (r > innerEdge && r < outerEdge && abs(pos.y) < 0.05) {
    // Disk opacity varies with radius
    float opacity = smoothstep(outerEdge, innerEdge + 1.0, r) * 0.9;

    // Spiral structure
    float phi = atan(pos.z, pos.x);
    float spiral = sin(phi * 3.0 - log(r) * 4.0 + uTime * 0.3) * 0.3 + 0.7;

    color = diskColor(r, rs, pos, viewDir) * spiral * opacity;
    return true;
  }
  return false;
}

// ─── Geodesic integration ───────────────────────────────────────────

// Kerr metric geodesic integration (Boyer-Lindquist → Cartesian)
// At uSpin=0, reduces to Schwarzschild: a = -(3/2) * rs * L² / r⁵ * pos
// At uSpin>0, Σ replaces r² in the metric and frame dragging is added.
// Spin axis aligned with +Y.

void main() {
  // ─── Ray setup ────────────────────────────────────────────────────
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;

  // Ray direction in camera space
  float halfFov = uFov * 0.5;
  vec3 rayDir = normalize(vec3(uv * tan(halfFov), -1.0));

  // Transform to world space
  vec3 rd = (uCameraMatrix * vec4(rayDir, 0.0)).xyz;
  rd = normalize(rd);
  vec3 ro = (uCameraMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

  // ─── Black hole parameters ──────────────────────────────────────
  float rs = uMass;  // Schwarzschild radius
  vec3 bhPos = vec3(0.0);  // Black hole at origin

  // Kerr metric parameters
  float M = rs * 0.5;            // mass in geometric units
  float a = uSpin * M;           // spin angular momentum per unit mass
  float a2 = a * a;
  float rHorizon = M + sqrt(max(M * M - a2, 0.0));  // outer event horizon

  // ─── Ray march with geodesic bending ────────────────────────────
  vec3 pos = ro;
  vec3 vel = rd;

  float stepSize = 0.1;
  vec3 finalColor = vec3(0.0);
  bool absorbed = false;
  bool hitBackground = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 toCenter = bhPos - pos;
    float r = length(toCenter);

    // Adaptive step size: smaller near the horizon
    stepSize = max(0.02, min(0.3, (r - rHorizon) * 0.3));

    // Event horizon — ray absorbed
    if (r < rHorizon * 1.01) {
      absorbed = true;
      break;
    }

    // Far away — ray escaped
    if (r > MAX_DIST) {
      hitBackground = true;
      break;
    }

    // Kerr geodesic acceleration
    // Boyer-Lindquist quantities (spin axis = +Y)
    float cosTheta = pos.y / r;
    float cos2Theta = cosTheta * cosTheta;
    float sin2Theta = 1.0 - cos2Theta;
    float sigma = r * r + a2 * cos2Theta;

    vec3 L = cross(pos, vel);
    float L2 = dot(L, L);

    // Modified gravitational acceleration: Σ² replaces r⁴ in denominator
    // At a=0: sigma=r², so sigma²·r = r⁵ → recovers Schwarzschild
    vec3 accel = -1.5 * rs * L2 / (sigma * sigma * r) * pos;

    // Frame dragging (Lense-Thirring effect)
    // ω = 2Mar / ((r²+a²)² - a²Δsin²θ)
    float rr = r * r;
    float delta = rr - rs * r + a2;
    float ra2 = rr + a2;
    float omegaDen = ra2 * ra2 - a2 * delta * sin2Theta;
    float omega = a * rs * r / max(omegaDen, 0.001);
    accel += omega * cross(vec3(0.0, 1.0, 0.0), vel);

    // Leapfrog integration (symplectic — conserves energy)
    vel += accel * stepSize;
    vel = normalize(vel);  // photons travel at c
    pos += vel * stepSize;

    // Check accretion disk hit
    if (uShowDisk > 0.5) {
      vec3 dColor;
      if (hitDisk(pos, rs, vel, dColor)) {
        // Semi-transparent disk: accumulate color
        float alpha = 0.15;
        finalColor += dColor * alpha * (1.0 - length(finalColor) * 0.3);
      }
    }
  }

  // ─── Shading ────────────────────────────────────────────────────

  // Einstein ring glow (for non-absorbed rays)
  float photonSphere = computePhotonSphere(rs, uSpin);
  float ringGlow = 0.0;
  if (!absorbed) {
    float closest = length(cross(ro - bhPos, vel));
    ringGlow = exp(-pow((closest - photonSphere) / (rs * 0.3), 2.0)) * 0.8;
  }

  // Photon ring — critical impact parameter scales with photon sphere
  float criticalB = photonSphere * (1.0 + 0.73 * (1.0 - uSpin));  // ≈2.6rs at a=0
  float impactParam = length(cross(ro - bhPos, rd));
  float photonRing = exp(-pow((impactParam - criticalB) / (rs * 0.15), 2.0)) * 0.3;

  // ─── AR mode: camera background with black hole shadow ─────────
  if (uUseCamera > 0.5) {
    if (absorbed) {
      // Black hole shadow — pure black
      gl_FragColor = vec4(finalColor + vec3(1.0, 0.9, 0.7) * photonRing, 1.0);
    } else {
      // Background pixel — sample camera feed
      // Map lensed ray direction to screen UV
      vec3 localDir = (uInvCameraMatrix * vec4(vel, 0.0)).xyz;
      vec2 bgUV;
      if (localDir.z < 0.0) {
        float halfFovAR = uFov * 0.5;
        float screenAspect = uResolution.x / uResolution.y;
        vec2 projected = localDir.xy / (-localDir.z * tan(halfFovAR));
        projected.x /= screenAspect;
        bgUV = clamp(projected * 0.5 + 0.5, 0.0, 1.0);
      } else {
        bgUV = vUv;
      }
      // Mirror X only for front-facing (selfie) cameras
      if (uMirrorX > 0.5) {
        bgUV.x = 1.0 - bgUV.x;
      }

      vec3 camColor = texture2D(uBackground, bgUV).rgb;
      // Add disk colors accumulated during ray march + ring effects
      vec3 arColor = camColor + finalColor + vec3(0.6, 0.7, 1.0) * ringGlow + vec3(1.0, 0.9, 0.7) * photonRing;
      gl_FragColor = vec4(arColor, 1.0);
    }
    return;
  }

  // ─── Standard mode: star background ─────────────────────────────
  if (!absorbed && (hitBackground || true)) {
    if (uUseStarfield > 0.5) {
      // Sample equirectangular starfield texture
      vec2 sfUV = vec2(
        atan(vel.z, vel.x) / (2.0 * PI) + 0.5,
        acos(clamp(vel.y, -1.0, 1.0)) / PI
      );
      vec3 texColor = texture2D(uStarfield, sfUV).rgb;
      finalColor += texColor;
    } else {
      float stars = starField(vel);
      vec3 bgColor = vec3(0.0, 0.002, 0.008);
      vec3 starColor = vec3(0.9, 0.92, 1.0) * stars;
      finalColor += bgColor + starColor;
    }
    finalColor += vec3(0.6, 0.7, 1.0) * ringGlow;
  }

  finalColor += vec3(1.0, 0.9, 0.7) * photonRing;

  // Tone mapping (Reinhard)
  finalColor = finalColor / (1.0 + finalColor);
  // Gamma correction
  finalColor = pow(finalColor, vec3(1.0 / 2.2));

  gl_FragColor = vec4(finalColor, 1.0);
}
