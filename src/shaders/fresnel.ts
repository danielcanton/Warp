import * as THREE from "three";

// ─── Shared Fresnel vertex shader ──────────────────────────────────
export const fresnelVertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

// ─── Black hole fragment shader ────────────────────────────────────
// Dark core with bright edge glow (event horizon silhouette)
export const bhFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uGlowIntensity;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
  float rim = pow(fresnel, 2.5);
  // Dark core, bright rim
  vec3 core = vec3(0.01, 0.01, 0.02);
  vec3 glow = uColor * rim * (1.5 + uGlowIntensity * 2.0);
  // Subtle inner gradient
  float inner = pow(fresnel, 0.8) * 0.08;
  vec3 finalColor = core + glow + uColor * inner;
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ─── Neutron star / emissive star fragment shader ──────────────────
// Hot glowing surface with pulsing subsurface scattering look
export const nsFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uGlowIntensity;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
  float rim = pow(fresnel, 2.0);
  // Hot emissive core — bright center, hotter rim
  float core = 0.6 + 0.15 * sin(uTime * 8.0); // subtle pulse
  vec3 hotColor = uColor * core;
  vec3 rimColor = vec3(0.9, 0.95, 1.0) * rim * (1.0 + uGlowIntensity);
  vec3 finalColor = hotColor + rimColor;
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ─── Planet atmosphere fragment shader ─────────────────────────────
// Subtle Fresnel rim glow for atmosphere effect
export const atmosphereFragmentShader = /* glsl */ `
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
  float rim = pow(fresnel, 3.0) * 0.4;
  gl_FragColor = vec4(uColor, rim);
}
`;

// ─── Trail fragment shader ─────────────────────────────────────────
export const trailVertexShader = /* glsl */ `
attribute float aAlpha;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const trailFragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha);
}
`;

// ─── Material factories ────────────────────────────────────────────

export function makeBHMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: fresnelVertexShader,
    fragmentShader: bhFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uGlowIntensity: { value: 0.0 },
    },
    transparent: false,
  });
}

export function makeNSMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: fresnelVertexShader,
    fragmentShader: nsFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uGlowIntensity: { value: 0.0 },
      uTime: { value: 0.0 },
    },
    transparent: false,
  });
}

export function makeAtmosphereMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: fresnelVertexShader,
    fragmentShader: atmosphereFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

export function makeTrailMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: trailVertexShader,
    fragmentShader: trailFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}
