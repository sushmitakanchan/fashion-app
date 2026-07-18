"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Float,
  MeshDistortMaterial,
  OrbitControls,
} from "@react-three/drei";

function ShowcaseObject() {
  return (
    <Float speed={2} rotationIntensity={0.6} floatIntensity={0.9}>
      <mesh>
        {/* High subdivision so the distort material deforms smoothly. */}
        <icosahedronGeometry args={[1.3, 14]} />
        {/* The reference's blue organic blob, as the showcase object. Lower
            metalness than before: a mirror finish read as chrome-tech rather
            than the flat, matte blue shape this is imitating. */}
        <MeshDistortMaterial
          color="#2147f5"
          roughness={0.45}
          metalness={0.1}
          distort={0.35}
          speed={1.8}
        />
      </mesh>
    </Float>
  );
}

/**
 * A self-contained React Three Fiber scene. Lighting is explicit (no CDN HDR
 * fetch) so it works fully offline. Swap <ShowcaseObject /> for a <Model /> to
 * render a real GLTF garment.
 */
export default function ProductScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 42 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={2.2} />
        {/* Warm neutral rim. The object is already the accent, so tinting its
            edge blue too would flatten it. */}
        <directionalLight
          position={[-6, -3, -4]}
          intensity={0.5}
          color="#ddd8cf"
        />
        <ShowcaseObject />
        <ContactShadows
          position={[0, -1.8, 0]}
          opacity={0.45}
          scale={12}
          blur={2.6}
          far={4}
        />
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={1.2}
          minPolarAngle={Math.PI / 2.6}
          maxPolarAngle={Math.PI / 1.7}
        />
      </Suspense>
    </Canvas>
  );
}
