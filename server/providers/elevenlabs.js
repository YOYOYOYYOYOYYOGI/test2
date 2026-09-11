export class ElevenLabsProvider {
  constructor({ apiKey, voiceId, model, voices = {} }) { this.apiKey = apiKey; this.voiceId = voiceId; this.model = model; this.voices = voices; }
  get name() { return `ElevenLabs · ${Object.keys(this.voices).length || 1} voice${Object.keys(this.voices).length === 1 ? '' : 's'}`; }
  async synthesize({ text, speed = 1, voice }) {
    const selectedVoiceId = this.voices[voice] || this.voiceId;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(selectedVoiceId)}`,  { method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': this.apiKey, Accept: 'audio/mpeg' }, body: JSON.stringify({ text, model_id: this.model, voice_settings: { stability: .48, similarity_boost: .76, style: .2, use_speaker_boost: true }, output_format: speed === 1 ? 'mp3_44100_128' : 'mp3_44100_128' }) });
    if (!response.ok) { const detail = await response.text(); throw new Error(`TTS provider returned ${response.status}: ${detail.slice(0, 240)}`); }
    const buffer = Buffer.from(await response.arrayBuffer()); return { audioBase64: buffer.toString('base64'), contentType: 'audio/mpeg', provider: this.name };
  }
}
