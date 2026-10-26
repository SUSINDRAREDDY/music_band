import { analyseRecording } from './features.mjs';
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      id: data.id,
      evidence: analyseRecording(data.recording),
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
