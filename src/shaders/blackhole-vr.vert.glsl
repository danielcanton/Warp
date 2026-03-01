// VR skybox vertex shader for black hole ray marching
// Renders on an inverted sphere — passes world-space position to fragment shader
// so each eye gets correct parallax for stereoscopic rendering.

varying vec3 vWorldPos;
varying vec3 vCameraPos;

uniform vec3 uCameraPosVR; // World-space camera position (per-eye in VR)

void main() {
  // World position of this vertex on the inverted sphere
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vCameraPos = uCameraPosVR;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
