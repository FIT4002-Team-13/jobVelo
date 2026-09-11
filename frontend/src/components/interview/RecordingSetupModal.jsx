import { flex, button, modal } from "../../styles/layout";

export default function RecordingSetupModal({ isMicActive, audioStatus, onSetupRecording }) {
  return (
    <div className={modal.overlay}>
      <div className={`${modal.panel} max-w-sm`}>
        <div className={`${flex.col} items-center gap-4 text-center`}>
          <h2 className="text-lg font-bold text-neutral-800">Recording Setup</h2>
          <p className="text-sm text-neutral-500">
            The interview has begun. Grant microphone access to start live transcription.
          </p>

          <div className={`${flex.row} items-center gap-3 w-full rounded-xl border border-neutral-200 px-4 py-3`}>
            <span
              className={`w-2 h-2 rounded-pill shrink-0 transition-colors ${
                isMicActive ? "bg-mint-500" : "bg-neutral-300"
              }`}
            />
            <span className="flex-1 text-left text-sm text-neutral-700">
              {isMicActive ? "Mic active" : "Microphone"}
            </span>
            <button
              type="button"
              onClick={onSetupRecording}
              disabled={isMicActive}
              className={`${button.outline} !py-1 !px-3 text-xs ${isMicActive ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isMicActive ? "Ready" : "Set up recording"}
            </button>
          </div>

          {audioStatus && (
            <p
              className={`text-xs ${
                /denied|error|unable|no (microphone|screen)|cancelled/i.test(audioStatus)
                  ? "text-coral-500"
                  : "text-neutral-400"
              }`}
            >
              {audioStatus}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
