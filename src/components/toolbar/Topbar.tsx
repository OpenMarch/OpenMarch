import FileControls from './FileControls';
import PlaybackControls from './PlaybackControls';
import MarcherListModal from '../marcher/MarcherListModal';
import PageListModal from '../page/PageListModal';
import UiSettingsToolbar from './UiSettingsToolbar';
import ExportCoordinatesModal from '../exporting/ExportCoordinatesModal';
import AlignmentToolbar from './AlignmentToolbar';
import MeasuresModal from '../measures/MeasuresModal';

function Topbar({ className = "" }: { className?: string }) {
    const componentClassName = '';
    return (
        <div className={`overflow-scroll box-border gap-2 flex bg-gray-700 border-gray-500 border-0 border-b-2 border-solid w-full flex-wrap items-center p-4 m-0 ${className}`} >
            <FileControls className={componentClassName} />
            <PlaybackControls className={componentClassName} />
            <MarcherListModal className={componentClassName} />
            <PageListModal className={componentClassName} />
            {/* <MeasuresModal className={componentClassName} /> */}
            {/* <div className='h-full w-[1px] bg-gray-500' /> */}
            <UiSettingsToolbar className={`${componentClassName}`} />
            <AlignmentToolbar className={componentClassName} />
            <ExportCoordinatesModal className={componentClassName} />
        </div>
    );
}

export default Topbar;
