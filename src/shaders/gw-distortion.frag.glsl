// Screen-space gravitational wave distortion effect
// Radial ripple with chromatic aberration at wave peaks

uniform float intensity;
uniform float frequency;
uniform float waveTime;

void mainUv(inout vec2 uv) {
  if (intensity <= 0.0) return;

  vec2 center = vec2(0.5);
  vec2 delta = uv - center;
  float dist = length(delta);
  vec2 dir = delta / max(dist, 1e-6);

  // Radial wave with exponential decay toward edges
  float wave = sin(dist * frequency - waveTime * 12.0) * intensity * exp(-dist * 2.5);

  uv += dir * wave;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (intensity <= 0.0) {
    outputColor = inputColor;
    return;
  }

  vec2 center = vec2(0.5);
  vec2 delta = uv - center;
  float dist = length(delta);
  vec2 dir = delta / max(dist, 1e-6);

  // Chromatic aberration: slight offset per channel at wave peaks
  float wave = sin(dist * frequency - waveTime * 12.0) * intensity * exp(-dist * 2.5);
  float aberration = wave * 0.3;

  float r = texture2D(inputBuffer, uv + dir * aberration * 1.2).r;
  float g = texture2D(inputBuffer, uv).g;
  float b = texture2D(inputBuffer, uv - dir * aberration * 1.2).b;

  outputColor = vec4(r, g, b, inputColor.a);
}
