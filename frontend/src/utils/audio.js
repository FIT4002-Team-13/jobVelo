export function convertFloat32ToInt16(buffer) {
  const output = new DataView(new ArrayBuffer(buffer.length * 2));
  for (let i = 0; i < buffer.length; i += 1) {
    let sample = Math.max(-1, Math.min(1, buffer[i]));
    sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    output.setInt16(i * 2, sample, true);
  }
  return output.buffer;
}

export function downsampleBuffer(buffer, inputSampleRate, outputSampleRate = 16000) {
  if (outputSampleRate === inputSampleRate) {
    return convertFloat32ToInt16(buffer);
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    result[offsetResult] = count ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return convertFloat32ToInt16(result);
}
