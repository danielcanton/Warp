// Spacetime mesh vertex shader
// Deforms a planar grid using gravitational wave strain data h+(t) and hx(t)
// The quadrupolar deformation pattern comes from linearized GR:
//   z(x,y,t) = A * [h+(t)*cos(2θ) + hx(t)*sin(2θ)] * envelope(r)

uniform float uTime;        // normalized playback time [0, 1]
uniform float uAmplitude;   // visual amplification (real strain is ~1e-21)
uniform sampler2D uWaveform; // h+(t) in R channel, hx(t) in G channel

varying vec3 vPosition;
varying vec3 vNormal;
varying float vDisplacement;

void main() {
  vPosition = position;

  // Distance and angle from center of the mesh
  float r = length(position.xz);
  float theta = atan(position.z, position.x);

  // Sample waveform at retarded time (wave propagates outward from center)
  float propagationSpeed = 8.0;
  float retardedTime = uTime - r / propagationSpeed;
  retardedTime = clamp(retardedTime, 0.0, 1.0);

  vec2 strain = texture2D(uWaveform, vec2(retardedTime, 0.5)).rg;
  // Decode from [0,1] texture range to [-1,1] strain range
  float hPlus = strain.r * 2.0 - 1.0;
  float hCross = strain.g * 2.0 - 1.0;

  // Quadrupolar deformation pattern (linearized GR)
  float deformation = hPlus * cos(2.0 * theta) + hCross * sin(2.0 * theta);

  // Radial envelope: strong near center, fades outward
  float envelope = exp(-r * 0.15);

  // Apply displacement along Y axis
  float displacement = uAmplitude * deformation * envelope;
  vec3 displaced = vec3(position.x, position.y + displacement, position.z);

  vDisplacement = displacement;

  // Compute displaced normal (finite difference approximation)
  // This gives the mesh proper lighting on the deformed surface
  float eps = 0.05;
  float dR = length(vec2(position.x + eps, position.z));
  float dTheta = atan(position.z, position.x + eps);
  float dRetarded = clamp(uTime - dR / propagationSpeed, 0.0, 1.0);
  vec2 dStrain = texture2D(uWaveform, vec2(dRetarded, 0.5)).rg;
  float dHp = dStrain.r * 2.0 - 1.0;
  float dHc = dStrain.g * 2.0 - 1.0;
  float dDeform = dHp * cos(2.0 * dTheta) + dHc * sin(2.0 * dTheta);
  float dDisp = uAmplitude * dDeform * exp(-dR * 0.15);
  vec3 tangent = normalize(vec3(eps, dDisp - displacement, 0.0));

  float dR2 = length(vec2(position.x, position.z + eps));
  float dTheta2 = atan(position.z + eps, position.x);
  float dRetarded2 = clamp(uTime - dR2 / propagationSpeed, 0.0, 1.0);
  vec2 dStrain2 = texture2D(uWaveform, vec2(dRetarded2, 0.5)).rg;
  float dHp2 = dStrain2.r * 2.0 - 1.0;
  float dHc2 = dStrain2.g * 2.0 - 1.0;
  float dDeform2 = dHp2 * cos(2.0 * dTheta2) + dHc2 * sin(2.0 * dTheta2);
  float dDisp2 = uAmplitude * dDeform2 * exp(-dR2 * 0.15);
  vec3 bitangent = normalize(vec3(0.0, dDisp2 - displacement, eps));

  vNormal = normalize(cross(tangent, bitangent));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
