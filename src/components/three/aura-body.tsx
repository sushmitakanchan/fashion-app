"use client";

import * as React from "react";
import * as THREE from "three";

import type { BodyParams } from "@/lib/aura";

/**
 * A parametric mannequin built from a person's measurements.
 *
 * Every radius traces back to height, weight, gender and body type — this is a
 * body with the user's *proportions*, not their likeness. Reconstructing a face
 * from photographs is a different problem entirely, needing a dedicated avatar
 * service; nothing here attempts it.
 *
 * Construction is all lathes: a profile of (radius, height) points revolved
 * around Y. The torso is then squashed on Z, because a revolved profile is
 * circular and a body is wider than it is deep.
 */

// Heights up the body as fractions of stature, from standard anthropometry.
// Everything is pinned to these so the finished mesh measures exactly the
// stature the user entered — crown lands at 1.0, sole at 0.
const Y = {
  crown: 1.0,
  headCentre: 0.935,
  chin: 0.87,
  shoulder: 0.815,
  chest: 0.72,
  waist: 0.625,
  hip: 0.53,
  hipJoint: 0.5,
  crotch: 0.47,
  elbow: 0.63,
  wrist: 0.485,
  knee: 0.28,
  ankle: 0.035,
};

/** Revolve a profile, smoothing it through a Catmull-Rom spline first. */
function lathe(profile: [radius: number, y: number][], segments = 48) {
  const control = profile.map(([r, y]) => new THREE.Vector3(r, y, 0));
  const curve = new THREE.CatmullRomCurve3(control, false, "catmullrom", 0.5);

  const points = curve
    .getPoints(Math.max(24, profile.length * 6))
    // The spline overshoots past the axis on tight curves, which would fold the
    // mesh through itself.
    .map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));

  return new THREE.LatheGeometry(points, segments);
}

type Ring = { y: number; rx: number; rz: number };

/**
 * Loft a stack of elliptical rings into a surface.
 *
 * A lathe can't do this: revolving a profile makes every cross-section circular,
 * so one Z-squash has to serve the whole body. Real sections vary a lot —
 * shoulders are about a third as deep as they are wide, hips nearer 0.7 — and
 * forcing one ratio on both is what makes a revolved torso read as a slab.
 *
 * Smoothing rides on CatmullRomCurve3 by packing (rx, y, rz) into a Vector3:
 * the curve interpolates each component independently, which is exactly what's
 * wanted here.
 */
function loft(rings: Ring[], radialSegments = 48, steps = 140) {
  const curve = new THREE.CatmullRomCurve3(
    rings.map((r) => new THREE.Vector3(r.rx, r.y, r.rz)),
    false,
    "catmullrom",
    0.5,
  );

  const positions: number[] = [];
  const indices: number[] = [];
  const sampled = curve.getPoints(steps);
  const perRing = radialSegments + 1;

  for (const point of sampled) {
    const rx = Math.max(point.x, 0);
    const rz = Math.max(point.z, 0);
    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      positions.push(Math.cos(theta) * rx, point.y, Math.sin(theta) * rz);
    }
  }

  for (let i = 0; i < sampled.length - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * perRing + j;
      const b = a + perRing;
      // Wound so the normals face outward.
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A tapered limb, rounded at both ends, hanging down from its origin. */
function limb(topRadius: number, bottomRadius: number, length: number) {
  return lathe(
    [
      [0, 0],
      [topRadius * 0.55, -length * 0.015],
      [topRadius, -length * 0.1],
      [(topRadius + bottomRadius) * 0.52, -length * 0.5],
      [bottomRadius, -length * 0.9],
      [bottomRadius * 0.6, -length * 0.985],
      [0, -length],
    ],
    24,
  );
}

function useBodyParts(params: BodyParams) {
  return React.useMemo(() => {
    const h = params.height;
    const bust = 1 + params.bust;

    const upperArmLength = h * (Y.shoulder - Y.elbow);
    const forearmLength = h * (Y.elbow - Y.wrist);
    const thighLength = h * (Y.hipJoint - Y.knee);
    const calfLength = h * (Y.knee - Y.ankle);

    // Depth is set per station, as a fraction of that station's width, scaled by
    // the build's overall depth. Shoulders are far shallower than hips.
    const ring = (y: number, rx: number, depthFactor: number): Ring => ({
      y: h * y,
      rx,
      rz: rx * params.depth * depthFactor,
    });

    // Bottom-centre up over the shoulders, closing at radius 0 at both ends so
    // the surface is sealed. It stops at a rounded shoulder cap rather than
    // spiking up to the chin; the neck is a separate piece overlapping both this
    // and the head, which is what stops the head reading as severed.
    const torso = loft([
      ring(Y.crotch - 0.035, 0, 1),
      ring(Y.crotch - 0.02, params.hip * 0.62, 1),
      ring(Y.crotch + 0.02, params.hip * 0.95, 1),
      ring(Y.hip, params.hip, 1),
      ring(Y.waist - 0.04, params.waist * 1.06, 1.05),
      ring(Y.waist, params.waist, 1.05),
      ring(Y.chest - 0.03, params.chest * 0.98 * bust, 1),
      ring(Y.chest, params.chest * bust, 0.95),
      ring(Y.shoulder - 0.05, params.shoulder * 0.9, 0.78),
      ring(Y.shoulder - 0.025, params.shoulder * 0.98, 0.6),
      ring(Y.shoulder, params.shoulder, 0.52),
      ring(Y.shoulder + 0.022, params.shoulder * 0.82, 0.52),
      ring(Y.shoulder + 0.038, params.shoulder * 0.44, 0.7),
      ring(Y.shoulder + 0.045, 0, 1),
    ]);

    return {
      torso,
      // Overlaps the shoulder cap below and the head above, hiding both seams.
      neck: limb(params.neck * 0.98, params.neck * 1.05, h * 0.1),
      head: new THREE.SphereGeometry(params.headRadius, 32, 24),
      upperArm: limb(params.upperArm, params.upperArm * 0.74, upperArmLength),
      forearm: limb(params.upperArm * 0.74, params.forearm * 0.6, forearmLength),
      hand: new THREE.SphereGeometry(params.forearm * 0.78, 16, 12),
      thigh: limb(params.thigh, params.thigh * 0.62, thighLength),
      calf: limb(params.calf, params.calf * 0.45, calfLength),
      foot: new THREE.SphereGeometry(params.calf * 0.6, 16, 12),
      lengths: { upperArmLength, forearmLength, thighLength, calfLength },
    };
  }, [params]);
}

export function AuraBody({ params }: { params: BodyParams }) {
  const parts = useBodyParts(params);
  const h = params.height;

  const material = React.useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        // Neutral stone. Deliberately mid-grey: anything lighter washes out
        // against the warm-white card once the key light hits it, anything
        // darker sinks into the near-black card in dark mode. This separates
        // from both (~4:1), and monochrome keeps the accent to blue alone.
        color: "#7e7a75",
        roughness: 0.62,
        metalness: 0.04,
      }),
    [],
  );

  // Geometries are rebuilt whenever the measurements change; the old GPU buffers
  // won't be collected on their own.
  React.useEffect(() => {
    return () => {
      parts.torso.dispose();
      parts.neck.dispose();
      parts.head.dispose();
      parts.upperArm.dispose();
      parts.forearm.dispose();
      parts.hand.dispose();
      parts.thigh.dispose();
      parts.calf.dispose();
      parts.foot.dispose();
    };
  }, [parts]);

  React.useEffect(() => () => material.dispose(), [material]);

  // Arms hang from inboard of the widest point of the shoulders.
  const shoulderX = params.shoulder * 0.84;
  const hipX = params.hip * 0.42;
  const armDrop = 0.14; // radians out from vertical — a relaxed A-pose

  return (
    // Centred on the origin so it orbits around its middle rather than its feet.
    <group position={[0, -h * 0.5, 0]}>
      {/* Depth is already baked into the loft's rings — no scaling here. */}
      <mesh geometry={parts.torso} material={material} />

      {/* Hangs down from just under the head, into the shoulder cap. */}
      <mesh
        geometry={parts.neck}
        material={material}
        position={[0, h * (Y.chin + 0.012), 0]}
        scale={[1, 1, 0.86]}
      />

      <mesh
        geometry={parts.head}
        material={material}
        position={[0, h * Y.headCentre, 0]}
        scale={[0.82, 1.12, 0.9]}
      />

      {[-1, 1].map((side) => (
        <group key={side}>
          <group
            position={[side * shoulderX, h * Y.shoulder, 0]}
            rotation={[0, 0, side * -armDrop]}
          >
            <mesh geometry={parts.upperArm} material={material} />
            <group position={[0, -parts.lengths.upperArmLength, 0]}>
              <mesh geometry={parts.forearm} material={material} />
              <mesh
                geometry={parts.hand}
                material={material}
                position={[0, -parts.lengths.forearmLength - params.forearm * 0.3, 0]}
                scale={[0.78, 1.5, 0.42]}
              />
            </group>
          </group>

          <group
            position={[side * hipX, h * Y.hipJoint, 0]}
            rotation={[0, 0, side * -0.035]}
          >
            <mesh geometry={parts.thigh} material={material} />
            <group position={[0, -parts.lengths.thighLength, 0]}>
              <mesh geometry={parts.calf} material={material} />
              <mesh
                geometry={parts.foot}
                material={material}
                position={[0, -parts.lengths.calfLength, params.calf * 0.5]}
                scale={[0.8, 0.55, 2.1]}
              />
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}
