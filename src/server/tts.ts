import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

/**
 * Convierte texto a voz con las voces neuronales de Microsoft Edge.
 * Es el mismo servicio que usa edge-tts en Python: gratuito y sin API key.
 * Devuelve un Buffer MP3.
 */
export async function synthesizeSpeech(text: string, voice: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(text);
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    audioStream.on('end', () => resolve());
    audioStream.on('error', (err: Error) => reject(err));
  });

  tts.close();
  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) throw new Error('El servicio de voz devolvio un audio vacio.');
  return buffer;
}
