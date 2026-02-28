// Fullscreen quad vertex shader for black hole ray marching
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
