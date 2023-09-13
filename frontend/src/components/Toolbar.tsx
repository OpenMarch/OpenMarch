import React from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import { useObserver } from "mobx-react-lite";
import { FaPlay, FaBackward, FaFastBackward, FaForward, FaFastForward, FaPause } from "react-icons/fa";

const Toolbar: React.FC = () => {
    const [playing, setPlaying] = React.useState(false);

    const togglePlay = () => { setPlaying(!playing) };

    return (
        <>
            <div className="container-xl">
                <div className="row">
                    <div className="col">
                        <h1>Toolbar</h1>
                    </div>
                </div>
            </div>
            <ButtonGroup aria-label="Basic example">
                <Button variant="secondary">
                    <FaFastBackward />
                </Button>
                <Button variant="secondary">
                    <FaBackward />
                </Button>
                <Button variant="secondary" onClick={togglePlay}>
                    {playing ? <FaPause /> : <FaPlay />}
                </Button>
                <Button variant="secondary">
                    <FaForward />
                </Button>
                <Button variant="secondary">
                    <FaFastForward />
                </Button>
            </ButtonGroup>
        </>
    );
};

export default Toolbar;
