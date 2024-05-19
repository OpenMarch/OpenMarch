import FileControls from './FileControls';
import PlaybackControls from './PlaybackControls';
import MarcherListModal from '../marcher/MarcherListModal';
import PageListModal from '../page/PageListModal';
import UiSettingsToolbar from './UiSettingsToolbar';
import ExportCoordinatesModal from '../exporting/ExportCoordinatesModal';
import AlignmentToolbar from './AlignmentToolbar';
import MeasuresModal from '../measures/MeasuresModal';

function Topbar() {
    const componentClassName = 'mx-2';


    return (
        <nav className="bg-gray-300 dark:bg-gray-700 flex flex-wrap items-center justify-between p-4 m-0" >
            <FileControls className={componentClassName} />
            <PlaybackControls className={componentClassName} />
            <MarcherListModal className={componentClassName} />
            <PageListModal className={componentClassName} />
            {/* <MeasuresModal className={componentClassName} /> */}
            <div className='vertival-divider' />
            <UiSettingsToolbar className={componentClassName} />
            <AlignmentToolbar className={componentClassName} />
            <ExportCoordinatesModal className={componentClassName} />
        </nav>
    );
}

export default Topbar;
