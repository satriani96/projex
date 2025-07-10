import { useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';

interface SketchPadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: string) => void;
  initialData: string | null;
}

const SketchPadModal = ({ isOpen, onClose, onSave, initialData }: SketchPadModalProps) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  const getInitialData = (): { elements: readonly ExcalidrawElement[]; appState: Partial<AppState> } => {
    const defaultAppState = {
      viewBackgroundColor: '#ffffff',
      activeTool: {
        type: 'freedraw' as const,
        locked: false,
        lastActiveTool: null,
        customType: null,
      },
    };

    if (!initialData) {
      return { elements: [], appState: defaultAppState };
    }
    try {
      const data = JSON.parse(initialData);
      if (data && Array.isArray(data.elements) && typeof data.appState === 'object') {
        return {
          elements: data.elements,
          appState: { ...data.appState, ...defaultAppState },
        };
      }
    } catch (error) {
      console.error('Error parsing initial sketch data:', error);
    }
    // Fallback for corrupted or invalid data
    return { elements: [], appState: defaultAppState };
  };

  const handleSave = () => {
    if (!excalidrawAPI) return;

    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();

    // We want to save the core state, but not transient things like collaborators
    const saveData = {
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        currentItemFontFamily: appState.currentItemFontFamily,
        currentItemRoughness: appState.currentItemRoughness,
        currentItemStrokeColor: appState.currentItemStrokeColor,
        currentItemStrokeWidth: appState.currentItemStrokeWidth,
        currentItemTextAlign: appState.currentItemTextAlign,
        gridSize: appState.gridSize,
        name: appState.name,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
      },
    };

    onSave(JSON.stringify(saveData));
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="p-3 border-b flex justify-between items-center bg-gray-50 rounded-t-lg flex-shrink-0">
          <h2 className="text-lg font-semibold">Sketch Pad (Excalidraw)</h2>
          <div className="flex items-center space-x-2">
            <button type="button" onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
              Save & Close
            </button>
            <button onClick={onClose} className="px-4 py-1.5 bg-gray-200 rounded-md hover:bg-gray-300 text-sm">
              Cancel
            </button>
          </div>
        </div>
        <div className="flex-1 w-full h-full">
          <Excalidraw
            excalidrawAPI={setExcalidrawAPI}
            initialData={getInitialData()}
            // You can add other props here as needed, e.g., for UI customization
            // uiOptions={{ canvasActions: { clearCanvas: false } }}
          />
        </div>
      </div>
    </div>
  );
};

export default SketchPadModal;
