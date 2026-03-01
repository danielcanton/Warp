import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface GridDistortionProps {
  grid?: number;
  mouse?: number;
  strength?: number;
  relaxation?: number;
  className?: string;
}

const vertexShader = `
uniform float time;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform sampler2D uDataTexture;
uniform sampler2D uTexture;
uniform float time;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec4 offset = texture2D(uDataTexture, vUv);

  // Stronger ambient drift — visible breathing effect
  float drift = 0.008 * sin(time * 0.4 + vUv.x * 6.0) + 0.006 * cos(time * 0.3 + vUv.y * 5.0);
  uv.x += drift;
  uv.y += 0.006 * cos(time * 0.35 + vUv.x * 4.0);

  // Gravitational wave pulse — radial distortion from center every ~4s
  vec2 center = vUv - 0.5;
  float dist = length(center);
  float wave = sin(dist * 20.0 - time * 1.6) * exp(-dist * 3.0);
  float pulse = 0.012 * wave * (0.5 + 0.5 * sin(time * 0.8));
  uv += normalize(center + 0.0001) * pulse;

  // Pulsing central glow — subtle alpha oscillation
  float glow = 0.06 * exp(-dist * 4.0) * (0.5 + 0.5 * sin(time * 0.6));

  // Mouse-driven distortion
  uv -= 0.02 * offset.rg;

  vec4 color = texture2D(uTexture, uv);
  color.rgb += vec3(0.35, 0.25, 0.75) * glow;
  gl_FragColor = color;
}
`;

/** Generate a dark spacetime grid as a canvas-backed texture */
function createGridTexture(): THREE.CanvasTexture {
  const W = 1600, H = 1000;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Deep space background
  ctx.fillStyle = '#000005';
  ctx.fillRect(0, 0, W, H);

  const gridSize = 48;

  // Grid lines — brighter and thicker
  for (let y = 0; y <= H; y += gridSize) {
    const alpha = 0.14 + 0.06 * Math.sin(y * 0.008);
    ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let x = 0; x <= W; x += gridSize) {
    const alpha = 0.14 + 0.06 * Math.sin(x * 0.008);
    ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // Grid intersections — small bright dots
  for (let y = 0; y <= H; y += gridSize) {
    for (let x = 0; x <= W; x += gridSize) {
      const dist = Math.sqrt((x - W / 2) ** 2 + (y - H / 2) ** 2);
      const alpha = Math.max(0.05, 0.25 - dist / 1200);
      ctx.fillStyle = `rgba(165, 180, 252, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Central glow — gravitational well (stronger)
  const gradient = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 500);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
  gradient.addColorStop(0.2, 'rgba(99, 102, 241, 0.12)');
  gradient.addColorStop(0.5, 'rgba(34, 211, 238, 0.05)');
  gradient.addColorStop(1, 'rgba(0, 0, 5, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Scatter stars
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 1.4;
    const alpha = 0.15 + Math.random() * 0.35;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const GridDistortion: React.FC<GridDistortionProps> = ({
  grid: gridProp,
  mouse = 0.15,
  strength = 0.25,
  relaxation = 0.9,
  className = ''
}) => {
  const grid = gridProp ?? (typeof window !== 'undefined' && window.innerWidth < 768 ? 20 : 34);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    container.innerHTML = '';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const camera = new THREE.OrthographicCamera(0, 0, 0, 0, -1000, 1000);
    camera.position.z = 2;

    // Generate grid texture
    const gridTexture = createGridTexture();

    const size = grid;
    const data = new Float32Array(4 * size * size);
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = Math.random() * 255 - 125;
      data[i * 4 + 1] = Math.random() * 255 - 125;
    }

    const dataTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    dataTexture.magFilter = THREE.LinearFilter;
    dataTexture.minFilter = THREE.LinearFilter;
    dataTexture.needsUpdate = true;

    const uniforms = {
      time: { value: 0 },
      resolution: { value: new THREE.Vector4() },
      uTexture: { value: gridTexture },
      uDataTexture: { value: dataTexture }
    };

    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true
    });

    const geometry = new THREE.PlaneGeometry(1, 1, size - 1, size - 1);
    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width === 0 || height === 0) return;

      const containerAspect = width / height;
      renderer.setSize(width, height);
      plane.scale.set(containerAspect, 1, 1);

      const frustumHeight = 1;
      const frustumWidth = frustumHeight * containerAspect;
      camera.left = -frustumWidth / 2;
      camera.right = frustumWidth / 2;
      camera.top = frustumHeight / 2;
      camera.bottom = -frustumHeight / 2;
      camera.updateProjectionMatrix();

      uniforms.resolution.value.set(width, height, 1, 1);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    const mouseState = { x: 0, y: 0, prevX: 0, prevY: 0, vX: 0, vY: 0 };

    // Listen on document so mouse events work even when content overlays the canvas
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      mouseState.vX = x - mouseState.prevX;
      mouseState.vY = y - mouseState.prevY;
      Object.assign(mouseState, { x, y, prevX: x, prevY: y });
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const rect = container.getBoundingClientRect();
      const x = (touch.clientX - rect.left) / rect.width;
      const y = 1 - (touch.clientY - rect.top) / rect.height;
      mouseState.vX = x - mouseState.prevX;
      mouseState.vY = y - mouseState.prevY;
      Object.assign(mouseState, { x, y, prevX: x, prevY: y });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchmove', handleTouchMove, { passive: true });

    handleResize();

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      uniforms.time.value += 0.05;

      const d = dataTexture.image.data as Float32Array;
      for (let i = 0; i < size * size; i++) {
        d[i * 4] *= relaxation;
        d[i * 4 + 1] *= relaxation;
      }

      const gridMouseX = size * mouseState.x;
      const gridMouseY = size * mouseState.y;
      const maxDist = size * mouse;

      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const distSq = (gridMouseX - i) ** 2 + (gridMouseY - j) ** 2;
          if (distSq < maxDist * maxDist) {
            const index = 4 * (i + size * j);
            const power = Math.min(maxDist / Math.sqrt(distSq), 10);
            d[index] += strength * 100 * mouseState.vX * power;
            d[index + 1] -= strength * 100 * mouseState.vY * power;
          }
        }
      }

      dataTexture.needsUpdate = true;
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleTouchMove);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      dataTexture.dispose();
      gridTexture.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [grid, mouse, strength, relaxation]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 ${className}`}
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export default GridDistortion;
