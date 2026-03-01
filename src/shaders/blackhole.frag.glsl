// Black hole gravitational lensing ray marching shader
// Implements Schwarzschild metric geodesic integration for photon paths
// with accretion disk, Einstein ring, and procedural star field

precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uMass;           // Schwarzschild radius scale (0.5 - 5.0)
uniform float uShowDisk;       // 0 or 1 — toggle accretion disk
uniform vec2 uResolution;
uniform mat4 uCameraMatrix;    // inverse view matrix (camera world transform)
uniform float uFov;            // camera FOV in radians

// AR mode — camera feed as background
uniform sampler2D uBackground; // Camera feed texture (or empty)
uniform float uUseCamera;      // 0.0 = procedural stars, 1.0 = camera feed
uniform mat4 uInvCameraMatrix; // Inverse of uCameraMatrix (computed in JS)

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

// ─── Accretion disk ─────────────────────────────────────────────────

// Temperature-based coloring: hot inner → cool outer
vec3 diskColor(float r, float rs) {
  float innerEdge = rs * 3.0;  // ISCO for Schwarzschild
  float outerEdge = rs * 15.0;

  // Normalized radius within disk
  float t = clamp((r - innerEdge) / (outerEdge - innerEdge), 0.0, 1.0);

  // Temperature profile: T ~ r^(-3/4) for thin disk
  float temp = pow(1.0 - t, 0.75);

  // Hot: blue-white, Cool: red-orange
  vec3 hot = vec3(0.8, 0.85, 1.0);
  vec3 warm = vec3(1.0, 0.6, 0.2);
  vec3 cool = vec3(0.8, 0.2, 0.05);

  vec3 color;
  if (temp > 0.5) {
    color = mix(warm, hot, (temp - 0.5) * 2.0);
  } else {
    color = mix(cool, warm, temp * 2.0);
  }

  // Doppler shift approximation (one side brighter)
  float phi = atan(r, r); // simplified
  float brightness = 1.0 + 0.3 * sin(uTime * 0.5);

  // Radial brightness falloff
  float falloff = smoothstep(outerEdge, innerEdge, r);

  return color * falloff * brightness * 2.5;
}

// Check if ray hits the thin accretion disk (y ≈ 0 plane)
bool hitDisk(vec3 pos, float rs, out vec3 color) {
  float r = length(pos);
  float innerEdge = rs * 3.0;
  float outerEdge = rs * 15.0;

  if (r > innerEdge && r < outerEdge && abs(pos.y) < 0.05) {
    // Disk opacity varies with radius
    float opacity = smoothstep(outerEdge, innerEdge + 1.0, r) * 0.9;

    // Spiral structure
    float phi = atan(pos.z, pos.x);
    float spiral = sin(phi * 3.0 - log(r) * 4.0 + uTime * 0.3) * 0.3 + 0.7;

    color = diskColor(r, rs) * spiral * opacity;
    return true;
  }
  return false;
}

// ─── Geodesic integration ───────────────────────────────────────────

// Schwarzschild effective potential gradient (for null geodesics)
// d²r/dλ² = -dV/dr where V_eff = L²/(2r²)(1 - rs/r)
// We integrate in Cartesian coordinates using the acceleration:
//   a = -(3/2) * rs * L² / r^5 * pos  (leading-order approximation)
// This is the key GR effect that bends light around the black hole.

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
    stepSize = max(0.02, min(0.3, (r - rs) * 0.3));

    // Event horizon — ray absorbed
    if (r < rs * 1.01) {
      absorbed = true;
      break;
    }

    // Far away — ray escaped
    if (r > MAX_DIST) {
      hitBackground = true;
      break;
    }

    // Gravitational lensing: geodesic equation approximation
    // For Schwarzschild metric, the deflection for a photon:
    // a = -(3/2) * rs * |L|² / r^5 * pos
    // where L = pos × vel (angular momentum)
    vec3 L = cross(pos, vel);
    float L2 = dot(L, L);
    float r5 = r * r * r * r * r;
    vec3 accel = -1.5 * rs * L2 / r5 * pos;

    // Leapfrog integration (symplectic — conserves energy)
    vel += accel * stepSize;
    vel = normalize(vel);  // photons travel at c
    pos += vel * stepSize;

    // Check accretion disk hit
    if (uShowDisk > 0.5) {
      vec3 dColor;
      if (hitDisk(pos, rs, dColor)) {
        // Semi-transparent disk: accumulate color
        float alpha = 0.15;
        finalColor += dColor * alpha * (1.0 - length(finalColor) * 0.3);
      }
    }
  }

  // ─── Shading ────────────────────────────────────────────────────
  bool usedCamera = false;

  if (absorbed) {
    // Black hole shadow — pure black with subtle blue-shifted edge
    float edgeGlow = 0.0;
    finalColor += vec3(0.0, 0.0, edgeGlow);
  } else if (hitBackground) {
    // Einstein ring glow — brighten rays that passed close to the photon sphere
    float closest = length(cross(ro - bhPos, vel));  // impact parameter approximation
    float photonSphere = rs * 1.5;
    float ringGlow = exp(-pow((closest - photonSphere) / (rs * 0.3), 2.0)) * 0.8;

    if (uUseCamera > 0.5) {
      // AR mode: sample camera feed with gravitational lensing
      // Map the lensed ray direction back to screen-space UV
      vec3 localDir = (uInvCameraMatrix * vec4(vel, 0.0)).xyz;
      float halfFovAR = uFov * 0.5;
      float screenAspect = uResolution.x / uResolution.y;

      // Project lensed direction to UV — fallback to original vUv if ray bends behind camera
      vec2 bgUV;
      if (localDir.z < 0.0) {
        vec2 projected = localDir.xy / (-localDir.z * tan(halfFovAR));
        projected.x /= screenAspect;
        bgUV = clamp(projected * 0.5 + 0.5, 0.0, 1.0);
      } else {
        bgUV = vUv;
      }

      // Flip for front-facing camera
      bgUV.y = 1.0 - bgUV.y;
      bgUV.x = 1.0 - bgUV.x;

      vec3 camColor = texture2D(uBackground, bgUV).rgb;
      // DEBUG: show UV as color so we can tell if texture or UV is the problem
      // Red = bgUV.x, Green = bgUV.y, Blue = texture brightness
      finalColor += vec3(bgUV.x, bgUV.y, camColor.r + camColor.g + camColor.b);
      usedCamera = true;
    } else {
      // Standard mode: procedural star field lensed through curved spacetime
      float stars = starField(vel);
      vec3 bgColor = vec3(0.0, 0.002, 0.008); // deep space blue-black
      vec3 starColor = vec3(0.9, 0.92, 1.0) * stars;
      finalColor += bgColor + starColor;
    }

    finalColor += vec3(0.6, 0.7, 1.0) * ringGlow;
  }

  // ─── Photon ring — accumulation of light near the photon sphere ─
  // This creates the bright ring visible in "Interstellar" imagery
  float impactParam = length(cross(ro - bhPos, rd));
  float photonRing = exp(-pow((impactParam - rs * 2.6) / (rs * 0.15), 2.0)) * 0.3;
  finalColor += vec3(1.0, 0.9, 0.7) * photonRing;

  if (!usedCamera) {
    // Tone mapping (simple Reinhard) — only for procedural content
    finalColor = finalColor / (1.0 + finalColor);
    // Gamma correction
    finalColor = pow(finalColor, vec3(1.0 / 2.2));
  }
  // Camera pixels skip tone mapping — they're already display-ready sRGB

  gl_FragColor = vec4(finalColor, 1.0);
}
