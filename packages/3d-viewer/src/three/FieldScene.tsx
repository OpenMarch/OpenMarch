import { Canvas } from "@react-three/fiber";
import { HighSchoolField } from "./Field";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export default function FieldScene({
    fieldDepth = 45,
}: {
    fieldDepth?: number;
}) {
    return (
        <Canvas camera={{ position: [0, 60, 80], fov: 45 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[50, 50, 50]} intensity={1} />

            <HighSchoolField />

            <OrbitControls
                target={[0, 0, -fieldDepth / 2]}
                maxPolarAngle={Math.PI / 2.1}
                minDistance={30}
                maxDistance={200}
            />
            <primitive
                object={new THREE.AxesHelper(20)}
                position={[0, 0, -22.5]}
            />
        </Canvas>
    );
}
