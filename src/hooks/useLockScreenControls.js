import { useEffect, useRef } from 'react';
import useStore from '../store';
import { SILENT_AUDIO_BASE64 } from '../utils/silentAudio';

export default function useLockScreenControls() {
  const tasks = useStore((s) => s.tasks);
  const startTask = useStore((s) => s.startTask);
  const pauseTask = useStore((s) => s.pauseTask);

  const audioRef = useRef(null);
  const activeTaskIdRef = useRef(null);

  useEffect(() => {
    // 1. Initialize the silent audio element if it hasn't been already
    if (!audioRef.current) {
      const audio = new Audio(SILENT_AUDIO_BASE64);
      audio.loop = true;
      audioRef.current = audio;

      const unlockAudio = () => {
        if (audioRef.current) {
          audioRef.current.play().then(() => {
            if (!useStore.getState().tasks.some(t => t.isRunning)) {
              audioRef.current.pause();
            }
          }).catch(() => {});
        }
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
      };

      document.addEventListener('click', unlockAudio);
      document.addEventListener('touchstart', unlockAudio);
    }

    // 2. Identify precisely what is logically running currently
    const runningTask = tasks.find(t => t.isRunning);
    
    // 3. Persist the last actively modified task so that you can resume it straight from lock screen if paused
    if (runningTask) {
      activeTaskIdRef.current = runningTask.id;
    }

    const taskToDisplay = runningTask || tasks.find(t => t.id === activeTaskIdRef.current);

    // 4. Link up Web Media Session capabilities 
    if (taskToDisplay && 'mediaSession' in navigator) {
      const isCurrentlyRunning = !!runningTask;
      
      navigator.mediaSession.metadata = new MediaMetadata({
        title: taskToDisplay.title,
        artist: isCurrentlyRunning ? 'Logging time...' : 'Paused',
        album: 'Mission 10000',
        // artwork can be placed here if you serve a 512x512 PNG, e.g. [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }]
      });
      
      navigator.mediaSession.playbackState = isCurrentlyRunning ? 'playing' : 'paused';

      // Attach dynamic OS lock screen bindings
      navigator.mediaSession.setActionHandler('play', () => {
        startTask(taskToDisplay.id);
        // Play method happens via hook retrigger immediately following store update
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        pauseTask(taskToDisplay.id);
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        pauseTask(taskToDisplay.id);
      });
    }

    // 5. Hard toggling the underlying silent audio heartbeat to grab locks
    if (runningTask) {
      // The browser grants this because startTask was inevitably fired by a transient user click activation
      audioRef.current.play().catch(e => console.log('Silent tracker blocked: Web Audio needs user gesture first', e));
    } else {
      audioRef.current.pause();
    }
  }, [tasks, startTask, pauseTask]);
}
