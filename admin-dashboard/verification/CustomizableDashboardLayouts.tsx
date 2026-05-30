import React, { useState, useEffect } from 'react';

export interface Widget {
  id: string;
  title: string;
  content: string;
}

const DEFAULT_WIDGETS: Widget[] = [
  { id: 'w-1', title: 'System Overview', content: 'CPU: 45% | Mem: 2GB' },
  { id: 'w-2', title: 'Recent Activity', content: '3 new logins in last hour' },
  { id: 'w-3', title: 'Asset Status', content: 'USDC, XLM Active' },
  { id: 'w-4', title: 'Quick Actions', content: 'Add Asset | Invite User' },
];

export const CustomizableDashboardLayouts: React.FC = () => {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('fluid-dashboard-layout');
    if (saved) {
      try {
        setWidgets(JSON.parse(saved));
      } catch (e) {
        setWidgets(DEFAULT_WIDGETS);
      }
    } else {
      setWidgets(DEFAULT_WIDGETS);
    }
  }, []);

  const saveLayout = (newWidgets: Widget[]) => {
    setWidgets(newWidgets);
    localStorage.setItem('fluid-dashboard-layout', JSON.stringify(newWidgets));
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const newWidgets = [...widgets];
    const draggedIndex = newWidgets.findIndex(w => w.id === draggedId);
    const targetIndex = newWidgets.findIndex(w => w.id === targetId);

    const [draggedWidget] = newWidgets.splice(draggedIndex, 1);
    newWidgets.splice(targetIndex, 0, draggedWidget);

    saveLayout(newWidgets);
    setDraggedId(null);
  };

  const handleReset = () => {
    saveLayout(DEFAULT_WIDGETS);
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Dashboard Layout</h2>
        <button
          onClick={handleReset}
          className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Reset Layout"
        >
          Reset to Default
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-label="Draggable Widget Area">
        {widgets.map(widget => (
          <div
            key={widget.id}
            draggable
            onDragStart={(e) => handleDragStart(e, widget.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, widget.id)}
            className={`p-4 border rounded-lg cursor-move bg-gray-50 dark:bg-gray-800 dark:border-gray-700 hover:shadow-md transition-shadow
              ${draggedId === widget.id ? 'opacity-50 border-dashed border-blue-500' : ''}`}
            aria-label={`Widget: ${widget.title}`}
          >
            <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2 select-none">{widget.title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 select-none">{widget.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
};