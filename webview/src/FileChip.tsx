import React from 'react';

interface Props {
    fileName: string;
    onRemove?: () => void;
}

export default function FileChip({ fileName, onRemove }: Props): React.ReactElement {
    const shortName = fileName.split(/[\\/]/).pop() ?? fileName;

    return (
        <div className="file-chip">
            <span>📄 {shortName}</span>
            {onRemove && (
                <button className="chip-remove" onClick={onRemove} title={`Remove ${shortName}`}>
                    ×
                </button>
            )}
        </div>
    );
}
