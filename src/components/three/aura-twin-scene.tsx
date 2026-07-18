"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";

import { deriveBodyParams, type BodyMeasurements } from "@/lib/aura";
import { AuraBody } from "./aura-body";

/**
 * The AURA twin's WebGL scene. Lighting is explicit (no CDN HDR fetch) so it
 * renders fully offline.
 */
export default function AuraTwinScene({
  measurements,
}: {
  measurements: BodyMeasurements;
}) {
  const params = deriveBodyParams(measurements);

  // Frame the body regardless of stature: back the camera off proportionally.
  const distance = params.height * 2.1;

  return (
    <Canvas
      camera={{ position: [0, params.height * 0.08, distance], fov: 32 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 6, 6]} intensity={2.4} />
        {/* The accent, used as a rim: a cool blue edge on the stone figure's
            shadow side. The only colour in an otherwise monochrome scene. */}
        <directionalLight
          position={[-5, 2, -4]}
          intensity={0.6}
          color="#2147f5"
        />
        <directionalLight position={[0, -3, 3]} intensity={0.25} />

        <AuraBody params={params} />

        <ContactShadows
          position={[0, -params.height * 0.5, 0]}
          opacity={0.4}
          scale={params.height * 2.4}
          blur={2.4}
          far={2}
        />
        <OrbitControls
          enablePan={false}
          autoRotate
          autoRotateSpeed={1.1}
          minDistance={params.height * 1.2}
          maxDistance={params.height * 3.4}
          minPolarAngle={Math.PI / 3.4}
          maxPolarAngle={Math.PI / 1.8}
        />
      </Suspense>
    </Canvas>
  );
}
