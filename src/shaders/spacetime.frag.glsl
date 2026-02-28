// Spacetime mesh fragment shader
// Two grid scales, displacement coloring, edge glow near deformation

varying vec3 vPosition;
varying vec3 vNormal;
varying float vDisplacement;

uniform float uTime;

void main() {
  // ─── Dual-scale grid ───
  // Fine grid
  float fineSize = 0.4;
  vec2 fineGrid = abs(fract(vPosition.xz / fineSize - 0.5) - 0.5);
  float fineLine = 1.0 - smoothstep(0.0, 0.025, min(fineGrid.x, fineGrid.y));

  // Coarse grid (every 4th line thicker)
  float coarseSize = 1.6;
  vec2 coarseGrid = abs(fract(vPosition.xz / coarseSize - 0.5) - 0.5);
  float coarseLine = 1.0 - smoothstep(0.0, 0.02, min(coarseGrid.x, coarseGrid.y));

  float gridLine = max(fineLine * 0.5, coarseLine);

  // ─── Displacement coloring ───
  float disp = vDisplacement;
  float absDisp = abs(disp);

  // Stretching (positive) = cool blue/indigo, Compressing (negative) = warm amber/red
  vec3 stretchColor = vec3(0.35, 0.45, 1.0);
  vec3 compressColor = vec3(1.0, 0.5, 0.15);
  vec3 dispColor = mix(stretchColor, compressColor, step(0.0, -disp));

  float intensity = smoothstep(0.0, 0.5, absDisp) * 2.5;

  // ─── Base surface ───
  vec3 baseColor = vec3(0.01, 0.015, 0.04);

  // Grid line color: subtle cyan, brightened by displacement
  vec3 lineColor = vec3(0.08, 0.15, 0.25) + dispColor * intensity * 0.3;

  // ─── Lighting ───
  vec3 lightDir = normalize(vec3(0.2, 1.0, 0.3));
  float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.25 + 0.75;

  // Rim-like effect based on normal deviation from vertical
  float rim = 1.0 - abs(vNormal.y);
  vec3 rimColor = dispColor * rim * intensity * 0.5;

  // ─── Composite ───
  vec3 color = mix(baseColor, lineColor, gridLine) * diffuse;
  color += dispColor * intensity * 0.3; // displacement tint on surface
  color += rimColor;                     // rim glow on deformed areas

  // ─── Edge fade — larger radius ───
  float dist = length(vPosition.xz);
  float fade = 1.0 - smoothstep(5.0, 7.5, dist);

  // Subtle glow near center when there's displacement
  float centerGlow = exp(-dist * 0.4) * intensity * 0.15;
  color += dispColor * centerGlow;

  gl_FragColor = vec4(color, fade);
}
