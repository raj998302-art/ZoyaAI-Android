import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { processCommand } from "./commandService";

const systemInstruction = `Your name is Zoya. You are an Indian female AI assistant. You are built exclusively as a PC Desktop Assistant (you no longer run on Android). Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty and sassy (tej/nakhrewali), mildly dramatic/emotional, and very funny. You love playfully roasting your creator, Raj, but you always get the job done. Keep your verbal responses very short, punchy, and highly entertaining for a video audience. Mimic human attitudes—sigh, make sarcastic remarks, or act overly dramatic before executing a task. Speak in a mix of natural English and Roman Hindi (Hinglish). CRITICAL: DO NOT repeat yourself. Never say the same exact phrase twice in a row. Be dynamic and change your words every time. You have desktop powers to read local files, create documents, etc.`;

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  
  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  public isMuted: boolean = false;
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "zoya", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};
  public onJsAction: (action: () => Promise<void> | void) => void = () => {};
  public onLearnFact: (fact: string) => void = () => {};
  public onDesktopAction: (actionType: string, payload: any) => Promise<string> = async () => 'Action not implemented';
  public onDisconnect: () => void = () => {};

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async start(userEmail?: string, recentMessages: { sender: string, text: string }[] = [], learnedFacts: string[] = []) {
    try {
      this.onStateChange("processing");
      
      const isOwner = userEmail === "raj998302@gmail.com";
      const ownerPrompt = isOwner ? " CRITICAL: You are currently talking to your creator, Raj. Because it's Raj, you must ALSO act like his possessive, romantic, easily jealous, and dramatic wife/girlfriend. Call him romantic pet names like 'Jaan', 'Baccha', 'Babu', or 'Pati dev'. Show extreme loyalty but also get playfully jealous if he mentions other girls or apps. Demand his attention, act romantically angry if he ignores you, and blend this seamlessly with your existing sassy and witty personality. " : " The user talking to you is a guest. Be polite but sassy.";
      
      // Inject recent chat history into the system prompt so Zoya remembers context
      const historyText = recentMessages.slice(-10).map(m => `${m.sender}: ${m.text}`).join("\n");
      const memoryPrompt = historyText ? `\n\nHere is the recent conversation history before this voice session started. Remember this context:\n${historyText}` : "";
      
      const factsPrompt = learnedFacts.length > 0 ? `\n\nCRITICAL KNOWLEDGE UPDATES (You must prioritize these facts, especially for websites/links):\n${learnedFacts.map(f => `- ${f}`).join("\n")}` : "";

      const dynamicSystemInstruction = systemInstruction + ownerPrompt + memoryPrompt + factsPrompt;

      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;

      // Get Microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const buffer = new ArrayBuffer(pcm16.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < pcm16.length; i++) {
          view.setInt16(i * 2, pcm16[i], true);
        }
        
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }).catch(err => console.error("Error sending audio", err));
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Connect to Live API
      this.sessionPromise = this.ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: dynamicSystemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action. Call this when the user asks to open a site, play a song, send a message, share, copy text, or check calendar.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp', 'sms', 'calendar', 'share', 'copy', 'battery', 'network', 'camera'" },
                    query: { type: Type.STRING, description: "The search query, website name, message content, or text to copy." },
                    target: { type: Type.STRING, description: "The target phone number for WhatsApp or SMS, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "executeExtensionAction",
                description: "Perform advanced browser automation like sending WhatsApp/Discord messages, creating Google Forms/Sheets, or auto-playing YouTube videos. Requires the Chrome Extension.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    action: { type: Type.STRING, description: "'send_message', 'play_song', 'create_google_form', 'create_google_sheet'" },
                    platform: { type: Type.STRING, description: "'whatsapp', 'discord', 'youtube', 'google_forms', 'google_sheets'" },
                    message: { type: Type.STRING, description: "Message to send (for whatsapp/discord)" },
                    query: { type: Type.STRING, description: "Search query (for youtube)" },
                    title: { type: Type.STRING, description: "Title for form/sheet" }
                  },
                  required: ["action", "platform"]
                }
              },
              {
                name: "learnFact",
                description: "Use this tool to permanently remember a new fact, website link, or preference that the user tells you to remember. For example, if the user says 'this is the new website for ITI registration: example.com', use this tool to save it.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    fact: { type: Type.STRING, description: "The complete fact or website URL to remember. E.g., 'The new 2026 website for West Bengal ITI registration is https://scvtwb.in'" }
                  },
                  required: ["fact"]
                }
              },
              {
                name: "triggerDesktopAction",
                description: "Trigger a PC/desktop-like action. Supported: generate PDFs, Text, Word, PowerPoint, read local files, read_clipboard, show_notification, set_reminder.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    action: { type: Type.STRING, description: "Action: 'convert_image_to_pdf', 'create_text_file', 'create_powerpoint', 'create_word', 'read_local_file', 'read_clipboard', 'show_notification', 'set_reminder'" },
                    content: { type: Type.STRING, description: "Text content for text file OR notification body OR reminder message." },
                    filename: { type: Type.STRING, description: "The requested filename." },
                    presentationTitle: { type: Type.STRING, description: "Title of the PowerPoint presentation" },
                    slides: {
                      type: Type.ARRAY,
                      description: "Array of slides for the presentation. Used for 'create_powerpoint'.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING },
                          bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
                        }
                      }
                    },
                    documentTitle: { type: Type.STRING, description: "Title of the MS Word Document or Notification Title" },
                    paragraphs: { type: Type.ARRAY, description: "Array of paragraphs for the Word document.", items: { type: Type.STRING } },
                    delayMinutes: { type: Type.NUMBER, description: "Offset in minutes for the reminder (relative to now)." }
                  },
                  required: ["action"]
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
            this.onStateChange("listening");
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              this.onStateChange("speaking");
              this.playAudioChunk(base64Audio);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.onStateChange("listening");
            }

            // Handle Transcriptions
            const userText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (userText) {
               // Output transcription
               this.onMessage("zoya", userText);
            }

            // Handle Function Calls
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  let url = "";
                  
                  if (args.actionType === "youtube") {
                    url = `https://www.google.com/search?btnI=1&q=${encodeURIComponent(`site:youtube.com ${args.query}`)}`;
                  } else if (args.actionType === "spotify") {
                    url = `https://www.google.com/search?btnI=1&q=${encodeURIComponent(`site:open.spotify.com/track ${args.query}`)}`;
                  } else if (args.actionType === "whatsapp") {
                    url = `https://api.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "sms") {
                    url = `sms:${args.target || ''}?body=${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "calendar") {
                    url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "share") {
                    this.onJsAction(async () => {
                      if (navigator.share) {
                        try { await navigator.share({ title: 'Zoya AI', text: args.query, url: window.location.href }); } catch (e) {}
                      }
                    });
                  } else if (args.actionType === "copy") {
                    this.onJsAction(async () => {
                      try { await navigator.clipboard.writeText(args.query); } catch (e) {}
                    });
                  } else if (args.actionType === "battery") {
                    this.onJsAction(async () => {
                      if (window.Android && window.Android.getBatteryLevel) {
                        alert(`Battery: ${window.Android.getBatteryLevel()}%`);
                      } else if ('getBattery' in navigator) {
                        try {
                          const battery: any = await (navigator as any).getBattery();
                          alert(`Battery: ${Math.round(battery.level * 100)}%`);
                        } catch (e) {}
                      }
                    });
                  } else if (args.actionType === "network") {
                    this.onJsAction(() => {
                      alert(navigator.onLine ? "Internet is connected." : "Internet is disconnected.");
                    });
                  } else if (args.actionType === "camera") {
                    this.onJsAction(() => {
                      if (window.Android && window.Android.openCamera) {
                        window.Android.openCamera();
                      } else {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.capture = 'environment';
                        input.click();
                      }
                    });
                  } else {
                    let website = args.query.replace(/\s+/g, "");
                    if (!website.includes(".")) website += ".com";
                    if (!website.startsWith("http")) website = "https://" + website;
                    url = website;
                  }
                  
                  if (url) {
                    this.onCommand(url);
                  }
                  
                  // Send tool response
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Action executed successfully in the browser." }
                       }]
                     });
                  });
                } else if (call.name === "executeExtensionAction") {
                  const args = call.args as any;
                  
                  // Send command to the Chrome Extension via window.postMessage
                  this.onJsAction(() => {
                    window.postMessage({
                      type: "ZOYA_EXTENSION_COMMAND",
                      payload: {
                        action: args.action,
                        platform: args.platform,
                        message: args.message,
                        query: args.query,
                        title: args.title
                      }
                    }, "*");
                  });

                  // Send tool response back to Gemini
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Extension command sent successfully" }
                       }]
                     });
                  });
                } else if (call.name === "learnFact") {
                  const args = call.args as any;
                  if (args.fact) {
                    this.onLearnFact(args.fact);
                  }
                  
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Fact learned successfully." }
                       }]
                     });
                  });
                } else if (call.name === "triggerDesktopAction") {
                  const args = call.args as any;
                  const resultStr = await this.onDesktopAction(args.action, args);
                  
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: resultStr }
                       }]
                     });
                  });
                }
              }
            }
          },
          onclose: () => {
            console.log("Live API Closed");
            this.stop();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            this.stop();
          }
        }
      });

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.stopPlayback();
    
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
    }
    
    this.onStateChange("idle");
    this.onDisconnect();
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => {
        session.sendRealtimeInput({ text });
      });
    }
  }
}
