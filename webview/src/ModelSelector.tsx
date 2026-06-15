import React from 'react';
import { MODEL_INFO, type ModelId } from './types';

interface Props {
    selectedModel: ModelId;
    onModelChange: (model: ModelId) => void;
}

export default function ModelSelector({ selectedModel, onModelChange }: Props): React.ReactElement {
    return (
        <select
            className="model-selector"
            value={selectedModel}
            onChange={e => onModelChange(e.target.value as ModelId)}
            title="Select Claude model"
        >
            {(Object.entries(MODEL_INFO) as [ModelId, typeof MODEL_INFO[ModelId]][]).map(
                ([id, info]) => (
                    <option key={id} value={id}>
                        {info.icon} {info.label} – {info.description}
                    </option>
                ),
            )}
        </select>
    );
}
