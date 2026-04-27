import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, Float, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';

const SkinBubble = () => {
  const mesh = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (mesh.current) {
      mesh.current.rotation.x = state.clock.getElapsedTime() * 0.2;
      mesh.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      <Sphere ref={mesh} args={[1, 100, 100]} scale={2}>
        <MeshDistortMaterial
          color="#00f2fe" // Elegant Dark Blue Accent
          speed={2}
          distort={0.4}
          radius={1}
          metalness={0.8}
          roughness={0.2}
        />
      </Sphere>
    </Float>
  );
};

export const ThreeCanvas = () => {
  return (
    <div className="h-full w-full bg-surface rounded-3xl overflow-hidden min-h-[400px] border border-border-main accent-glow">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} />
        <SkinBubble />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
};
