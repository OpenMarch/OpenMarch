import React from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
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
                <Button data-toggle="tooltip" data-placement="bottom" variant="secondary" title="First page">
                    <FaFastBackward />
                </Button>
                <Button data-toggle="tooltip" data-placement="bottom" variant="secondary" title="Previous page">
                    <FaBackward />
                </Button>
                <Button data-toggle="tooltip" data-placement="bottom" variant="secondary" onClick={togglePlay} title="Play or pause">
                    {playing ? <FaPause /> : <FaPlay />}
                </Button>
                <Button data-toggle="tooltip" data-placement="bottom" variant="secondary" title="Next page">
                    <FaForward />
                </Button>
                <Button data-toggle="tooltip" data-placement="bottom" variant="secondary" title="Last page">
                    <FaFastForward />
                </Button>
            </ButtonGroup>
        </>
    );
};

export default Toolbar;
