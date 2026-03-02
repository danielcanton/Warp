// Black hole gravitational lensing ray marching shader — VR variant
// Derives ray direction from world-space fragment position on inverted sphere
// for correct stereoscopic parallax per eye.
//
// Two-tier passthrough support:
// - Tier 1 (fallback): Dark void + Einstein ring glow over transparent passthrough
// - Tier 2 (full):     Camera texture sampled with gravitational lensing

precision highp float;

varying vec3 vWorldPos;
varying vec3 vCameraPos;

uniform float uTime;
uniform float uMass;
uniform float uShowDisk;

// Passthrough uniforms
uniform float uPassthrough;    // 0.0 = skybox mode, 1.0 = passthrough mode
uniform float uHasCameraFeed;  // 0.0 = no camera texture (Tier 1), 1.0 = available (Tier 2)
uniform sampler2D uCameraFeed; // Passthrough camera texture (when available)
uniform vec3 uBHCenter;        // World-space black hole position
uniform float uSphereRadius;   // Localized sphere radius (for early ray termination)

const float PI = 3.14159265359;
const float MAX_DIST = 100.0;
const int MAX_STEPS = 200;

// ─── Procedural star field ──────────────────────────────────────────

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float starField(vec3 dir) {
  float phi = atan(dir.z, dir.x);
  float theta = acos(clamp(dir.y, -1.0, 1.0));

  float stars = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float scale = 80.0 + float(layer) * 60.0;
    vec2 grid = vec2(phi, theta) * scale;
    vec2 cell = floor(grid);
    vec2 frac_ = fract(grid);

    float h = hash(cell + float(layer) * 100.0);
    if (h > 0.97) {
      vec2 center = vec2(hash(cell * 1.7 + 0.3), hash(cell * 2.3 + 0.7));
      float d = length(frac_ - center);
      float brightness = smoothstep(0.08, 0.0, d) * (0.5 + 0.5 * hash(cell * 3.1));
      stars += brightness;
    }
  }

  float band = exp(-8.0 * (dir.y * dir.y));
  stars += band * 0.03;

  return stars;
}

// ─── Accretion disk ─────────────────────────────────────────────────

vec3 diskColor(float r, float rs) {
  float innerEdge = rs * 3.0;
  float outerEdge = rs * 15.0;
  float t = clamp((r - innerEdge) / (outerEdge - innerEdge), 0.0, 1.0);
  float temp = pow(1.0 - t, 0.75);

  vec3 hot = vec3(0.8, 0.85, 1.0);
  vec3 warm = vec3(1.0, 0.6, 0.2);
  vec3 cool = vec3(0.8, 0.2, 0.05);

  vec3 color;
  if (temp > 0.5) {
    color = mix(warm, hot, (temp - 0.5) * 2.0);
  } else {
    color = mix(cool, warm, temp * 2.0);
  }

  float brightness = 1.0 + 0.3 * sin(uTime * 0.5);
  float falloff = smoothstep(outerEdge, innerEdge, r);

  return color * falloff * brightness * 2.5;
}

bool hitDisk(vec3 pos, float rs, out vec3 color) {
  float r = length(pos);
  float innerEdge = rs * 3.0;
  float outerEdge = rs * 15.0;

  if (r > innerEdge && r < outerEdge && abs(pos.y) < 0.05) {
    float opacity = smoothstep(outerEdge, innerEdge + 1.0, r) * 0.9;
    float phi = atan(pos.z, pos.x);
    float spiral = sin(phi * 3.0 - log(r) * 4.0 + uTime * 0.3) * 0.3 + 0.7;
    color = diskColor(r, rs) * spiral * opacity;
    return true;
  }
  return false;
}

// ─── Camera UV mapping for lensed passthrough ───────────────────────

vec2 dirToEquirectUV(vec3 dir) {
  return vec2(
    0.5 + atan(dir.z, dir.x) / (2.0 * PI),
    0.5 - asin(clamp(dir.y, -1.0, 1.0)) / PI
  );
}

// ─── Geodesic integration ───────────────────────────────────────────

void main() {
  // Ray origin = camera position (per-eye for stereo parallax)
  vec3 ro = vCameraPos;

  // Ray direction = from camera through this fragment's world position on the sphere
  vec3 rd = normalize(vWorldPos - vCameraPos);

  // Black hole parameters
  float rs = uMass;
  // In passthrough mode, BH is at uBHCenter; in skybox mode, at origin
  vec3 bhPos = uPassthrough > 0.5 ? uBHCenter : vec3(0.0);

  // Early exit radius — localized sphere in passthrough, large distance in skybox
  float exitRadius = uPassthrough > 0.5 ? uSphereRadius * 1.1 : MAX_DIST;

  // Ray march with geodesic bending
  // In passthrough mode, camera is outside the localized sphere — start at sphere surface
  vec3 pos = uPassthrough > 0.5 ? vWorldPos : ro;
  vec3 vel = rd;

  float stepSize = 0.1;
  vec3 finalColor = vec3(0.0);
  float finalAlpha = 0.0;
  bool absorbed = false;
  bool escaped = false;

  // Accumulated disk color (pre-multiplied alpha)
  vec3 diskAccum = vec3(0.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 toCenter = bhPos - pos;
    float r = length(pos - bhPos);

    stepSize = max(0.02, min(0.3, (r - rs) * 0.3));

    if (r < rs * 1.01) {
      absorbed = true;
      break;
    }

    if (r > exitRadius) {
      escaped = true;
      break;
    }

    // Geodesic acceleration (relative to BH center)
    vec3 relPos = pos - bhPos;
    vec3 L = cross(relPos, vel);
    float L2 = dot(L, L);
    float r5 = r * r * r * r * r;
    vec3 accel = -1.5 * rs * L2 / r5 * relPos;

    vel += accel * stepSize;
    vel = normalize(vel);
    pos += vel * stepSize;

    if (uShowDisk > 0.5) {
      vec3 dColor;
      vec3 diskPos = pos - bhPos; // disk relative to BH center
      if (hitDisk(diskPos, rs, dColor)) {
        float alpha = 0.15;
        diskAccum += dColor * alpha * (1.0 - length(diskAccum) * 0.3);
      }
    }
  }

  // Ray entry point for glow calculations (sphere surface in passthrough, camera in skybox)
  vec3 rayEntry = uPassthrough > 0.5 ? vWorldPos : ro;

  // Einstein ring glow
  float ringGlow = 0.0;
  if (!absorbed) {
    vec3 relEntry = rayEntry - bhPos;
    float closest = length(cross(relEntry, vel));
    float photonSphere = rs * 1.5;
    ringGlow = exp(-pow((closest - photonSphere) / (rs * 0.3), 2.0)) * 0.8;
  }

  // Photon ring
  float impactParam = length(cross(rayEntry - bhPos, rd));
  float photonRing = exp(-pow((impactParam - rs * 2.6) / (rs * 0.15), 2.0)) * 0.3;

  // ─── Passthrough mode ───────────────────────────────────────────

  if (uPassthrough > 0.5) {
    if (absorbed) {
      // Dark void — mostly opaque black
      finalColor = vec3(0.0);
      finalAlpha = 0.85;
    } else {
      // Escaped ray — background is passthrough
      if (uHasCameraFeed > 0.5) {
        // Tier 2: Sample camera texture with gravitational lensing
        vec2 cameraUV = dirToEquirectUV(vel);
        vec3 cameraColor = texture2D(uCameraFeed, cameraUV).rgb;
        finalColor = cameraColor;
        finalAlpha = 1.0;
      } else {
        // Tier 1: Fully transparent — passthrough shows through compositor
        finalColor = vec3(0.0);
        finalAlpha = 0.0;
      }

      // Einstein ring glow (additive)
      vec3 einsteinGlow = vec3(0.6, 0.7, 1.0) * ringGlow;
      finalColor += einsteinGlow;
      finalAlpha = max(finalAlpha, ringGlow * 0.9);
    }

    // Photon ring (additive)
    vec3 photonColor = vec3(1.0, 0.9, 0.7) * photonRing;
    finalColor += photonColor;
    finalAlpha = max(finalAlpha, photonRing * 0.8);

    // Accretion disk
    finalColor += diskAccum;
    float diskBrightness = length(diskAccum);
    if (diskBrightness > 0.01) {
      finalAlpha = max(finalAlpha, min(1.0, diskBrightness * 2.0));
    }

    // Tone mapping (Reinhard)
    finalColor = finalColor / (1.0 + finalColor);
    // Gamma correction
    finalColor = pow(finalColor, vec3(1.0 / 2.2));

    gl_FragColor = vec4(finalColor, finalAlpha);

  // ─── Skybox mode (original behavior) ────────────────────────────

  } else {
    finalColor = diskAccum;

    // Star background
    if (!absorbed) {
      float stars = starField(vel);
      vec3 bgColor = vec3(0.0, 0.002, 0.008);
      vec3 starColor = vec3(0.9, 0.92, 1.0) * stars;
      finalColor += bgColor + starColor;
      finalColor += vec3(0.6, 0.7, 1.0) * ringGlow;
    }

    finalColor += vec3(1.0, 0.9, 0.7) * photonRing;

    // Tone mapping (Reinhard)
    finalColor = finalColor / (1.0 + finalColor);
    // Gamma correction
    finalColor = pow(finalColor, vec3(1.0 / 2.2));

    gl_FragColor = vec4(finalColor, 1.0);
  }
}
