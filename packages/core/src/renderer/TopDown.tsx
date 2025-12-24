import { Canvas } from "@react-three/fiber";
import { useRef } from "react";
import { MapControls, OrthographicCamera } from "@react-three/drei";

const FIELD_WIDTH = 300;
const FIELD_HEIGHT = 100;

/**
 * A single yard line using thin box geometry
 */
function YardLine({ x }: { x: number }) {
    return (
        <mesh position={[x, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.2, FIELD_HEIGHT, 0.1]} />
            <meshStandardMaterial color="white" />
        </mesh>
    );
}

/**
 * Hash marks for a yard line using thin box geometries
 */
function HashMarks({ x }: { x: number }) {
    const hashLength = FIELD_HEIGHT / 10;
    return (
        <>
            <mesh
                position={[x, 0.1, FIELD_HEIGHT / 4]}
                rotation={[-Math.PI / 2, 0, 0]}
            >
                <boxGeometry args={[0.2, hashLength, 0.1]} />
                <meshStandardMaterial color="white" />
            </mesh>
            <mesh
                position={[x, 0.1, -FIELD_HEIGHT / 4]}
                rotation={[-Math.PI / 2, 0, 0]}
            >
                <boxGeometry args={[0.2, hashLength, 0.1]} />
                <meshStandardMaterial color="white" />
            </mesh>
        </>
    );
}

/**
 * The football field plane representing the playing surface
 */
function Field() {
    return (
        <>
            {/* Main field surface */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <planeGeometry args={[FIELD_WIDTH, FIELD_HEIGHT]} />
                <meshStandardMaterial color="#2d5016" />
            </mesh>

            {/* Yard lines - using thin box geometries */}
            {Array.from({ length: 11 }, (_, i) => {
                const x = (i * FIELD_WIDTH) / 10 - FIELD_WIDTH / 2;
                return <YardLine key={i} x={x} />;
            })}

            {/* Hash marks (simplified) - using thin box geometries */}
            {Array.from({ length: 10 }, (_, i) => {
                const x = ((i + 1) * FIELD_WIDTH) / 10 - FIELD_WIDTH / 2;
                return <HashMarks key={`hash-${i}`} x={x} />;
            })}
        </>
    );
}

/**
 * Top-down view of a football field using React Three Fiber
 */
export default function TopDown() {
    const cameraRef = useRef(null);

    return (
        <Canvas style={{ width: "100%", height: "100%" }}>
            {/* Orthographic camera for top-down view */}
            <OrthographicCamera
                ref={cameraRef}
                makeDefault
                position={[0, 200, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                left={-FIELD_WIDTH / 2}
                right={FIELD_WIDTH / 2}
                top={FIELD_HEIGHT / 2}
                bottom={-FIELD_HEIGHT / 2}
                near={0.1}
                far={1000}
            />
            <MapControls makeDefault />

            {/* Ambient light for basic illumination */}
            <ambientLight intensity={0.6} />

            {/* Directional light from above */}
            <directionalLight position={[0, 100, 0]} intensity={0.4} />

            {/* Render the field */}
            <Field />
        </Canvas>
    );
}
