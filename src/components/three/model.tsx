"use client";

import { useGLTF } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";

/**
 * Loads a GLTF/GLB model. Drop a `.glb` into `public/models/` and render it
 * inside a <Canvas> (e.g. swap it into ProductScene's <Suspense>):
 *
 *   <Model url="/models/jacket.glb" scale={1.5} />
 *
 * `useGLTF` suspends while loading, so keep it under a <Suspense> boundary.
 */
export function Model({
  url,
  ...props
}: { url: string } & ThreeElements["group"]) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} {...props} />;
}
