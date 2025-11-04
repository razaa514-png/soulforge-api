module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // CORS (tighten later to your domain)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const body = req.body || {};
    const persona = body.persona;
    const messages = body.messages;

    if (!persona || !messages) {
      res.status(400).json({ error: 'Missing persona or messages' });
      return;
    }

    const system = {
      role: 'system',
      content: `You are ${persona.name}, ${persona.pitch}.
Style: ${persona.voice}. Be warm, concise, and PG-13.`
    };

    // 1) OpenAI
    const oaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.8,
        messages: [system, ...messages]
      })
    });

    if (!oaiResp.ok) {
      const t = await oaiResp.text();
      res.status(500).json({ error: 'openai_failed', details: t });
      return;
    }

    const oai = await oaiResp.json();
    const replyText = oai?.choices?.[0]?.message?.content || '…';

    // 2) ElevenLabs TTS
    const ttsResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVEN_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: replyText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.8 }
        })
      }
    );

    if (!ttsResp.ok) {
      const t = await ttsResp.text();
      // still return text so the chat works even if TTS hiccups
      res.status(200).json({ replyText, audioBase64: null, mime: null, tts_error: t });
      return;
    }

    const audioArrayBuf = await ttsResp.arrayBuffer();
    const audioBase64 = Buffer.from(audioArrayBuf).toString('base64');

    res.status(200).json({ replyText, audioBase64, mime: 'audio/mpeg' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
};
