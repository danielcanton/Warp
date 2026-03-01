// Black hole gravitational lensing ray marching shader — VR variant
// Derives ray direction from world-space fragment position on inverted sphere
// for correct stereoscopic parallax per eye.

precision highp float;

varying vec3 vWorldPos;
varying vec3 vCameraPos;

uniform float uTime;
uniform float uMass;
uniform float uShowDisk;

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

// ─── Geodesic integration ───────────────────────────────────────────

void main() {
  // Ray origin = camera position (per-eye for stereo parallax)
  vec3 ro = vCameraPos;

  // Ray direction = from camera through this fragment's world position on the sphere
  vec3 rd = normalize(vWorldPos - vCameraPos);

  // Black hole parameters
  float rs = uMass;
  vec3 bhPos = vec3(0.0);

  // Ray march with geodesic bending
  vec3 pos = ro;
  vec3 vel = rd;

  float stepSize = 0.1;
  vec3 finalColor = vec3(0.0);
  bool absorbed = false;
  bool hitBackground = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 toCenter = bhPos - pos;
    float r = length(toCenter);

    stepSize = max(0.02, min(0.3, (r - rs) * 0.3));

    if (r < rs * 1.01) {
      absorbed = true;
      break;
    }

    if (r > MAX_DIST) {
      hitBackground = true;
      break;
    }

    vec3 L = cross(pos, vel);
    float L2 = dot(L, L);
    float r5 = r * r * r * r * r;
    vec3 accel = -1.5 * rs * L2 / r5 * pos;

    vel += accel * stepSize;
    vel = normalize(vel);
    pos += vel * stepSize;

    if (uShowDisk > 0.5) {
      vec3 dColor;
      if (hitDisk(pos, rs, dColor)) {
        float alpha = 0.15;
        finalColor += dColor * alpha * (1.0 - length(finalColor) * 0.3);
      }
    }
  }

  // Einstein ring glow
  float ringGlow = 0.0;
  if (!absorbed) {
    float closest = length(cross(ro - bhPos, vel));
    float photonSphere = rs * 1.5;
    ringGlow = exp(-pow((closest - photonSphere) / (rs * 0.3), 2.0)) * 0.8;
  }

  // Photon ring
  float impactParam = length(cross(ro - bhPos, rd));
  float photonRing = exp(-pow((impactParam - rs * 2.6) / (rs * 0.15), 2.0)) * 0.3;

  // Star background
  if (!absorbed && (hitBackground || true)) {
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
