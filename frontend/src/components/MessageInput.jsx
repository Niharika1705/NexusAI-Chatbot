import { useState, useRef, useEffect } from 'react';
import { Send, ImagePlus, X, Mic, MicOff, Smile } from 'lucide-react';

const COMMON_EMOJIS = [
  '😊', '😂', '👍', '🔥', '❤️', '🙌', '🎯', '✨',
  '🤖', '🧠', '💡', '⚡', '🚀', '🔮', '📚', '✍️',
  '📐', '📝', '🔍', '❓', '📊', '🎉', '🌟', '💯'
];

export default function MessageInput({ onSendMessage, disabled }) {
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
      }
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!allowed.includes(file.type.toLowerCase())) {
        alert('Please select a valid image format (JPG, JPEG, PNG, WEBP).');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert('Image size exceeds maximum 10 MB limit.');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const removeSelectedImage = () => {
    setImageFile(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const addEmoji = (emoji) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((text.trim() || imageFile) && !disabled) {
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
      onSendMessage(text.trim(), imageFile);
      setText('');
      removeSelectedImage();
      setShowEmojiPicker(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="input-container">
      {imagePreview && (
        <div className="image-preview-bar">
          <div className="preview-thumb-container">
            <img src={imagePreview} alt="Preview" className="preview-thumb" />
            <button 
              type="button" 
              className="remove-img-btn" 
              onClick={removeSelectedImage}
              title="Remove image"
            >
              <X size={12} />
            </button>
          </div>
          <div className="preview-info">
            <span className="file-name">{imageFile?.name}</span>
            <span className="file-size">{(imageFile?.size / 1024).toFixed(1)} KB</span>
          </div>
        </div>
      )}

      {showEmojiPicker && (
        <div className="emoji-picker-popover">
          <div className="emoji-picker-header">
            <span>Emojis</span>
            <button type="button" className="close-emoji-btn" onClick={() => setShowEmojiPicker(false)}>
              <X size={12} />
            </button>
          </div>
          <div className="emoji-grid">
            {COMMON_EMOJIS.map((emoji, idx) => (
              <button 
                key={idx} 
                type="button" 
                className="emoji-item" 
                onClick={() => addEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="input-wrapper" onSubmit={handleSubmit}>
        {/* Upload Image Button */}
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Upload math question, diagram, or error screenshot"
        >
          <ImagePlus size={19} />
        </button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageSelect}
          accept="image/jpeg,image/png,image/webp,image/jpg"
          style={{ display: 'none' }}
        />

        {/* Emoji Button */}
        <button
          type="button"
          className={`emoji-btn ${showEmojiPicker ? 'active' : ''}`}
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          disabled={disabled}
          title="Insert Emoji"
        >
          <Smile size={19} />
        </button>

        {/* Voice Dictation Mic Button */}
        <button
          type="button"
          className={`mic-btn ${isListening ? 'listening' : ''}`}
          onClick={toggleListening}
          disabled={disabled}
          title={isListening ? "Listening... Click to stop" : "Voice dictation (Click to speak)"}
        >
          {isListening ? <MicOff size={19} /> : <Mic size={19} />}
        </button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          className="input-field"
          placeholder={
            isListening
              ? "Listening... Speak your message..."
              : imageFile
              ? "Ask a question about this image (or press Send)..."
              : "Type a message, speak, or upload an image..."
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />

        {/* Send Button */}
        <button 
          type="submit" 
          className="send-btn"
          disabled={(!text.trim() && !imageFile) || disabled}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
