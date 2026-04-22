import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, VolumeX, Keyboard, Send, Trash2, LogIn, LogOut, History, X, User as UserIcon, Settings, Sparkles } from "lucide-react";
import { getZoyaResponse, getZoyaAudio, resetZoyaSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { LiveSessionManager } from "./services/liveService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import SettingsPanel from "./components/SettingsPanel";
import { playPCM } from "./utils/audioUtils";
import {
  createMoodState,
  detectMoodTransition,
  moodEmoji,
  moodLabel,
  MoodState,
} from "./services/moodService";
import {
  autoLearnFromMessage,
  loadMemory,
  saveMemory,
} from "./services/memoryService";
import {
  loadSettings,
  saveSettings,
  updateSettings,
  ZoyaSettings,
} from "./services/settingsService";
import { speak as speakMood, stopSpeaking } from "./services/ttsService";
import { motion, AnimatePresence } from "motion/react";
import { auth, db, googleProvider } from "./firebase";
import { signInWithPopup, onAuthStateChanged, User, signOut } from "firebase/auth";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, setDoc, getDoc, deleteDoc, getDocs, where } from "firebase/firestore";
import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";
import pptxgen from "pptxgenjs";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

type AppState = "idle" | "listening" | "processing" | "speaking";

interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [learnedFacts, setLearnedFacts] = useState<string[]>([]);
  const [settings, setSettingsState] = useState<ZoyaSettings>(() => loadSettings());
  const [moodState, setMoodState] = useState<MoodState>(() => createMoodState());

  // Persist settings changes + sync to native + apply theme.
  const updateAppSettings = useCallback((patch: Partial<ZoyaSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    // Apply theme toggle to document root.
    const root = document.documentElement;
    if (settings.theme === "light") root.classList.add("zoya-light");
    else root.classList.remove("zoya-light");
  }, [settings.theme]);

  useEffect(() => {
    // Wake-word bridge: the native side calls window.ZoyaNative.onWakeWord(...)
    // when it hears "Hey Zoya". We use it to auto-start listening.
    const w = window as any;
    w.ZoyaNative = w.ZoyaNative || {};
    w.ZoyaNative.onWakeWord = (_transcript: string) => {
      // If there's a chat/live session toggle available, kick listening.
      try {
        const el = document.getElementById("zoya-primary-mic");
        if (el && typeof (el as HTMLButtonElement).click === "function") {
          (el as HTMLButtonElement).click();
        }
      } catch {}
    };
    w.ZoyaNative.onReminder = (payload: string) => {
      const [type, ...rest] = payload.split("|");
      const msg = rest.join("|");
      const line =
        type === "birthday"
          ? `\uD83C\uDF82 Aaj tumhara birthday hai Jaan! ${msg}`
          : type === "anniversary"
            ? `\u2764\uFE0F Happy anniversary mere Raja! ${msg}`
            : `\u23F0 ${msg}`;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-r", sender: "zoya", text: line }]);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        // Create or update user document
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            createdAt: new Date().toISOString(),
            preferences: { theme: "dark" }
          });
        }
      } else {
        setMessages([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    const q = query(
      collection(db, "messages"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rawMessages: any[] = [];
      snapshot.forEach((doc) => {
        rawMessages.push(doc.data());
      });
      
      rawMessages.sort((a, b) => a.timestamp - b.timestamp);
      
      const loadedMessages: ChatMessage[] = rawMessages.map(data => ({
        id: data.id,
        sender: data.sender,
        text: data.text
      }));
      setMessages(loadedMessages);
    }, (error) => {
      console.error("Firestore Error: ", error);
    });

    // Fetch learned facts
    const factsQuery = query(
      collection(db, "learned_facts"),
      where("userId", "==", user.uid)
    );
    
    const unsubscribeFacts = onSnapshot(factsQuery, (snapshot) => {
      const facts: string[] = [];
      snapshot.forEach((doc) => {
        facts.push(doc.data().fact);
      });
      setLearnedFacts(facts);
    });

    return () => {
      unsubscribe();
      unsubscribeFacts();
    };
  }, [user, isAuthReady]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const saveMessageToFirestore = async (msg: ChatMessage) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "messages", msg.id), {
        id: msg.id,
        sender: msg.sender,
        text: msg.text,
        timestamp: Date.now(),
        userId: user.uid
      });
    } catch (e) {
      console.error("Error saving message", e);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.isMuted = isMuted;
    }
  }, [isMuted]);

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const liveSessionRef = useRef<LiveSessionManager | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  // Speak Zoya's response using the mood-aware TTS. Falls back to the Gemini
  // TTS (PCM) only if the user has a working API key AND explicitly asks for
  // cinematic quality — otherwise the browser Web Speech API gives instant
  // pitch/rate control by mood.
  const speakWithMood = useCallback(
    async (text: string, mood: MoodState["mood"]) => {
      if (isMuted || !text) return;
      stopSpeaking();
      await new Promise<void>((resolve) => speakMood(text, mood, resolve));
    },
    [isMuted]
  );

  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), sender: "user", text: finalTranscript };
    if (!user) {
      setMessages((prev) => [...prev, userMsg]);
    } else {
      await saveMessageToFirestore(userMsg);
    }

    // Zoya bookkeeping: mark interaction (kills idle timer), learn facts, and
    // update mood based on what the user just said.
    try { (window as any).Android?.markInteraction?.(); } catch {}
    if (settings.memoryEnabled) autoLearnFromMessage(finalTranscript);
    const nextMood = settings.autoDetectMood
      ? detectMoodTransition(moodState, finalTranscript)
      : { ...moodState, lastUserMessageAt: Date.now() };
    setMoodState(nextMood);

    // If live session is active, send text through it
    if (isSessionActive && liveSessionRef.current) {
      liveSessionRef.current.sendText(finalTranscript);
      return;
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = await processCommand(finalTranscript);

    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      const zoyaMsg: ChatMessage = { id: Date.now().toString() + "-z", sender: "zoya", text: responseText };
      if (!user) {
        setMessages((prev) => [...prev, zoyaMsg]);
      } else {
        await saveMessageToFirestore(zoyaMsg);
      }
      
      if (!isMuted) {
        setAppState("speaking");
        await speakWithMood(responseText, nextMood.mood);
      }

      setAppState("idle");

      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
        if (commandResult.jsAction) {
          commandResult.jsAction();
        }
      }, 1500);
    } else {
      // 2. General Chit-Chat via Gemini with mood + memory
      responseText = await getZoyaResponse(finalTranscript, {
        history: messagesRef.current,
        mood: nextMood.mood,
        userEmail: user?.email || undefined,
      });
      const zoyaMsg: ChatMessage = { id: Date.now().toString() + "-z", sender: "zoya", text: responseText };
      if (!user) {
        setMessages((prev) => [...prev, zoyaMsg]);
      } else {
        await saveMessageToFirestore(zoyaMsg);
      }

      if (!isMuted) {
        setAppState("speaking");
        await speakWithMood(responseText, nextMood.mood);
      }
      setAppState("idle");
    }
  }, [isMuted, isSessionActive, user, settings, moodState]);

  useEffect(() => {
    return () => {
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      if (liveSessionRef.current) {
        liveSessionRef.current.stop();
        liveSessionRef.current = null;
      }
      setAppState("idle");
      resetZoyaSession();
    } else {
      try {
        setIsSessionActive(true);
        resetZoyaSession();
        
        const session = new LiveSessionManager();
        session.isMuted = isMuted;
        liveSessionRef.current = session;
        
        session.onStateChange = (state) => {
          setAppState(state);
        };
        
        session.onMessage = async (sender, text) => {
          const msg: ChatMessage = { id: Date.now().toString() + "-" + sender, sender, text };
          if (!user) {
            setMessages((prev) => [...prev, msg]);
          } else {
            await saveMessageToFirestore(msg);
          }
        };
        
        session.onCommand = (url) => {
          setTimeout(() => {
            window.open(url, "_blank");
          }, 1000);
        };

        session.onJsAction = (action) => {
          setTimeout(() => {
            action();
          }, 1000);
        };

        session.onDisconnect = () => {
          console.log("Session disconnected unexpectedly/intentionally.");
          setIsSessionActive(false);
          setAppState("idle");
          // Optionally we could resetZoyaSession() here, but we'll leave memory intact
        };

        session.onDesktopAction = async (actionType: string, payload: any) => {
          try {
            if (actionType === "convert_image_to_pdf") {
              const fileInput = document.createElement("input");
              fileInput.type = "file";
              fileInput.accept = "image/*";
              
              return new Promise((resolve) => {
                fileInput.onchange = async (e: any) => {
                  const file = e.target.files[0];
                  if (!file) {
                    resolve("User cancelled image selection.");
                    return;
                  }
                  
                  const reader = new FileReader();
                  reader.onload = function(event) {
                    const imgData = event.target?.result as string;
                    const doc = new jsPDF();
                    
                    const imgProps = doc.getImageProperties(imgData);
                    const pdfWidth = doc.internal.pageSize.getWidth();
                    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                    
                    doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
                    doc.save(payload.filename || "converted_zoya.pdf");
                    
                    resolve("Success! I have converted the image to PDF and saved it to your computer.");
                  };
                  reader.readAsDataURL(file);
                };
                fileInput.click();
              });
            } else if (actionType === "create_text_file") {
              const blob = new Blob([payload.content || ""], { type: "text/plain;charset=utf-8" });
              saveAs(blob, payload.filename || "zoya_file.txt");
              return "Successfully created the text file. Check your downloads folder!";
            } else if (actionType === "create_powerpoint") {
              const pres = new pptxgen();
              pres.title = payload.presentationTitle || "Presentation";
              
              let slide = pres.addSlide();
              slide.addText(payload.presentationTitle || "Presentation", { x: 1, y: 1, w: "80%", h: 2, fontSize: 36, align: "center" });
              
              if (payload.slides && Array.isArray(payload.slides)) {
                payload.slides.forEach((s: any) => {
                  let newSlide = pres.addSlide();
                  newSlide.addText(s.title || "", { x: 0.5, y: 0.5, w: "90%", h: 1, fontSize: 24, bold: true });
                  let bulletText = (s.bullets || []).map((b: string) => ({ text: b, options: { bullet: true } }));
                  newSlide.addText(bulletText, { x: 0.5, y: 1.5, w: "90%", h: 3, fontSize: 18 });
                });
              }
              const fileName = payload.filename || "Zoya_Presentation.pptx";
              pres.writeFile({ fileName });
              return `Successfully created and downloaded PowerPoint presentation: ${fileName}. Check your downloads folder!`;
            } else if (actionType === "create_word") {
              const children = [
                new Paragraph({
                    text: payload.documentTitle || "Zoya Document",
                    heading: HeadingLevel.HEADING_1,
                }),
              ];

              if (payload.paragraphs && Array.isArray(payload.paragraphs)) {
                  payload.paragraphs.forEach((p: string) => {
                      children.push(new Paragraph({
                          children: [new TextRun(p)]
                      }));
                  });
              }

              const wordDoc = new Document({
                  sections: [{
                      properties: {},
                      children: children
                  }]
              });

              Packer.toBlob(wordDoc).then(blob => {
                  saveAs(blob, payload.filename || "Zoya_Document.docx");
              });
              
              return "Successfully created and downloaded Word Document! Check your downloads folder.";
            } else if (actionType === "read_local_file") {
              const fileInput = document.createElement("input");
              fileInput.type = "file";
              fileInput.accept = ".txt,.json,.csv,.md,.html,.xml,text/*";
              
              return new Promise((resolve) => {
                fileInput.onchange = async (e: any) => {
                  const file = e.target.files[0];
                  if (!file) {
                    resolve("User cancelled file selection.");
                    return;
                  }
                  
                  const reader = new FileReader();
                  reader.onload = function(event) {
                    const content = event.target?.result as string;
                    // Limit text content to prevent hitting token limits
                    const truncated = content.substring(0, 15000); 
                    resolve(`File Name: ${file.name}\n\nContents:\n${truncated}`);
                  };
                  reader.onerror = () => {
                    resolve("Error: Couldn't read the file. Maybe it's unsupported or corrupted.");
                  };
                  reader.readAsText(file);
                };
                fileInput.click();
              });
            } else if (actionType === "read_clipboard") {
              try {
                const text = await navigator.clipboard.readText();
                return text ? `Clipboard Text:\n${text}` : "Clipboard is empty.";
              } catch (e: any) {
                return "Failed to read clipboard. Check browser permissions.";
              }
            } else if (actionType === "show_notification") {
              if (Notification.permission === "granted") {
                new Notification(payload.documentTitle || "Zoya", { body: payload.content || "Hey!" });
                return "Notification sent.";
              } else if (Notification.permission !== "denied") {
                const permission = await Notification.requestPermission();
                if (permission === "granted") {
                  new Notification(payload.documentTitle || "Zoya", { body: payload.content || "Hey!" });
                  return "Notification sent after getting permission.";
                }
              }
              return "Notification permission denied.";
            } else if (actionType === "set_reminder") {
              const mins = payload.delayMinutes || 1;
              const ms = mins * 60 * 1000;
               if (Notification.permission !== "granted" && Notification.permission !== "denied") {
                 await Notification.requestPermission();
               }
               
               setTimeout(() => {
                 if (Notification.permission === "granted") {
                   new Notification("Zoya Reminder", { body: payload.content || "Time's up!" });
                 } else {
                   alert("Zoya Reminder: " + (payload.content || "Time's up!"));
                 }
                 // Optional sound
                 try {
                   const audio = new Audio("https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg");
                   audio.play().catch(()=>{});
                 } catch(e) {}
               }, ms);
               return `Reminder set for ${mins} minutes from now.`;
            }
            return "Unknown desktop action.";
          } catch (err: any) {
             console.error("Desktop Action Error:", err);
             return "Failed to execute desktop action: " + err.message;
          }
        };

        session.onLearnFact = async (fact) => {
          if (user) {
            try {
              await addDoc(collection(db, "learned_facts"), {
                userId: user.uid,
                fact: fact,
                timestamp: Date.now()
              });
            } catch (e) {
              console.error("Error saving fact", e);
            }
          }
        };

        await session.start(user?.email || undefined, messagesRef.current, learnedFacts);
      } catch (e) {
        console.error("Failed to start session", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    handleTextCommand(textInput);
    setTextInput("");
    setShowTextInput(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Chat History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute right-0 top-0 h-full w-full sm:w-80 bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col shadow-2xl"
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <History size={20} className="text-violet-400" />
                <h2 className="text-lg font-bold tracking-tight">Chat History</h2>
              </div>
              <button 
                onClick={() => setShowHistory(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-6">
                  <Sparkles size={48} className="mb-4" />
                  <p className="text-sm">No history yet. Start a conversation with Zoya!</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                      msg.sender === 'user' 
                        ? 'bg-violet-600/20 border border-violet-500/30 text-violet-100 rounded-tr-none' 
                        : 'bg-white/5 border border-white/10 text-white/90 rounded-tl-none'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {messages.length > 0 && (
              <div className="p-4 border-t border-white/10">
                <button
                  onClick={async () => {
                    if (confirm("Clear all chat history?")) {
                      if (user) {
                        const q = query(collection(db, "messages"), where("userId", "==", user.uid));
                        const snapshot = await getDocs(q);
                        await Promise.all(snapshot.docs.map(doc => deleteDoc(doc.ref)));
                      } else {
                        setMessages([]);
                      }
                      resetZoyaSession();
                    }
                  }}
                  className="w-full py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Trash2 size={16} />
                  Clear History
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinematic Background Gradients */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-900/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-900/20 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-500 to-pink-500 flex items-center justify-center font-bold text-sm">
            Z
          </div>
          <h1 className="text-xl font-serif font-medium tracking-wide opacity-90">Zoya</h1>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <div className="flex items-center gap-2 mr-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 max-w-[160px] sm:max-w-[250px]">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full border border-white/20 shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <UserIcon size={16} className="text-white/60 shrink-0" />
              )}
              <span className="text-xs font-medium text-white/80 truncate">{user.displayName?.split(' ')[0]}</span>
              {user.email === "raj998302@gmail.com" && (
                <span className="text-[9px] sm:text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/30 font-bold shrink-0">
                  Creator
                </span>
              )}
            </div>
          )}
          
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-2 rounded-full transition-all border ${showHistory ? 'bg-violet-500/20 border-violet-500/50 text-violet-400' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'}`}
            title="Chat History"
          >
            <History size={18} />
          </button>

          {user ? (
            <button
              onClick={handleLogout}
              className="p-2 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg shadow-red-900/20 flex items-center gap-2 px-4 text-sm font-bold border border-red-500"
              title="Logout"
            >
              <LogOut size={16} />
              <span className="hidden md:inline">Logout</span>
            </button>
          ) : (
            <button
              onClick={handleLogin}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 flex items-center gap-2 px-4 text-sm"
              title="Login to sync history"
            >
              <LogIn size={16} className="opacity-70" />
              <span className="hidden md:inline opacity-80">Login</span>
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={async () => {
                const isConfirmed = window.confirm("Are you sure you want to clear the chat history?");
                if (isConfirmed) {
                  if (user) {
                    try {
                      const q = query(collection(db, "messages"), where("userId", "==", user.uid));
                      const snapshot = await getDocs(q);
                      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
                      await Promise.all(deletePromises);
                    } catch (e) {
                      console.error("Error clearing history", e);
                    }
                  } else {
                    setMessages([]);
                  }
                  resetZoyaSession();
                }
              }}
              className="p-2 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/10"
              title="Clear Chat History"
            >
              <Trash2 size={18} className="opacity-70" />
            </button>
          )}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={18} className="opacity-70" />
            ) : (
              <Volume2 size={18} className="opacity-70" />
            )}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
            title="Settings"
          >
            <Settings size={18} className="opacity-70" />
          </button>
          <div
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-pink-500/10 border border-pink-400/30 text-pink-200 text-xs"
            title={`Zoya is feeling ${moodLabel(moodState.mood)}`}
          >
            <span>{moodEmoji(moodState.mood)}</span>
            <span className="opacity-80">{moodLabel(moodState.mood)}</span>
          </div>
        </div>
      </header>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={updateAppSettings}
          onClose={() => setShowSettings(false)}
          onResetMemory={() => {
            if (confirm("Reset Zoya's memory?")) {
              try { localStorage.removeItem("zoya.memory.v1"); } catch {}
            }
          }}
        />
      )}

      {/* Main Content - Visualizer & Chat */}
      <main className="absolute inset-0 flex flex-row items-center justify-between w-full h-full z-10 overflow-hidden pt-20 pb-24 px-4 md:px-12 pointer-events-none">
        
        {/* Left Column: Zoya Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6">
            <AnimatePresence>
              {appState === "processing" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 text-cyan-300/80 text-sm md:text-base italic font-serif"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Replying...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center Visualizer (Fixed Full Screen Background) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Visualizer state={appState} />
        </div>

        {/* Right Column: User Status */}
        <div className="flex w-[30%] lg:w-[25%] h-full flex-col justify-center gap-4 z-10">
          <div className="h-6 flex justify-end">
            <AnimatePresence>
              {appState === "listening" && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 text-violet-300/80 text-sm md:text-base italic"
                >
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  Listening...
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </main>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-6 md:pb-8 z-20 shrink-0 gap-4">
        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-full max-w-md flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 pl-4 backdrop-blur-md shadow-2xl"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a message to Zoya..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:hover:bg-violet-500 transition-colors"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <button
            id="zoya-primary-mic"
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-3 px-8 py-4 rounded-full font-medium tracking-wide transition-all duration-300 shadow-2xl
              ${
                isSessionActive
                  ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30"
                  : "bg-white/10 text-white border border-white/20 hover:bg-white/20 hover:scale-105"
              }
            `}
          >
            {isSessionActive ? (
              <>
                <MicOff size={20} />
                <span>End Session</span>
              </>
            ) : (
              <>
                <Mic size={20} className="group-hover:animate-bounce" />
                <span>Start Session</span>
              </>
            )}
          </button>
          
          {!isSessionActive && (
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors shadow-2xl"
              title="Type instead"
            >
              <Keyboard size={20} className="opacity-70" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
