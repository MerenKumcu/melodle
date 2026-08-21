'use client';

import React, { useState, useEffect, useRef } from 'react';
import songsData from '../data/songs.json';

interface Song {
  id: number;
  title: string;
  artist: { name: string };
  preview: string;
  album: { cover_medium: string };
}

interface LocalSong {
  id: number;
  query: string;
  artist: string;
  title: string;
}

const STAGES = [0.5, 1, 3, 5, 10, 16];

const normalizeText = (text: string) => {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
};

export default function MelodlePage() {
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(0);
  const [targetSong, setTargetSong] = useState<Song | null>(null);
  const [currentSongLocal, setCurrentSongLocal] = useState<LocalSong | null>(null);
  
  const [stageIndex, setStageIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [gameStatus, setGameStatus] = useState<'PLAYING' | 'WON' | 'LOST'>('PLAYING');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Arama state'leri
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSongs, setFilteredSongs] = useState<LocalSong[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Şarkı yükleme fonksiyonu
  const loadSong = async (index: number) => {
    setIsLoading(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);

    const safeIndex = index % songsData.length;
    setCurrentSongIndex(safeIndex);

    const songInfo = songsData[safeIndex];
    setCurrentSongLocal(songInfo);

    // Durumu sıfırla
    setGuesses([]);
    setStageIndex(0);
    setGameStatus('PLAYING');
    setSearchQuery('');
    setFilteredSongs([]);

    try {
      const res = await fetch(`/api/deezer?q=${encodeURIComponent(songInfo.query)}`);
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        setTargetSong(data.data[0]);
      }
    } catch (err) {
      console.error('Şarkı yüklenemedi:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Site her açıldığında / yenilendiğinde 50 şarkıdan rastgele birini seç
    const randomIndex = Math.floor(Math.random() * songsData.length);
    loadSong(randomIndex);
  }, []);

  const handleNextSong = () => {
    const randomIndex = Math.floor(Math.random() * songsData.length);
    loadSong(randomIndex !== currentSongIndex ? randomIndex : (randomIndex + 1) % songsData.length);
  };

  useEffect(() => {
    const query = normalizeText(searchQuery);
    if (query.length < 2) {
      setFilteredSongs([]);
      return;
    }

    const results = songsData.filter((song) => {
      const fullText = normalizeText(`${song.artist} ${song.title}`);
      return fullText.includes(query);
    });

    setFilteredSongs(results.slice(0, 6));
  }, [searchQuery]);

  const playAudioSnippet = () => {
    if (!targetSong || !audioRef.current || isLoading) return;

    const audio = audioRef.current;

    if (isPlaying) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    audio.currentTime = 0;
    audio.play();
    setIsPlaying(true);

    const playDuration = (gameStatus === 'PLAYING' ? STAGES[stageIndex] : 30) * 1000;

    timeoutRef.current = setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
    }, playDuration);
  };

  const handleGuess = (guessedSong: LocalSong) => {
    if (gameStatus !== 'PLAYING' || !currentSongLocal) return;

    const guessText = `${guessedSong.artist} - ${guessedSong.title}`;
    const newGuesses = [...guesses, guessText];
    setGuesses(newGuesses);
    setSearchQuery('');
    setFilteredSongs([]);

    const isCorrect = guessedSong.id === currentSongLocal.id;

    if (isCorrect) {
      setGameStatus('WON');
    } else {
      advanceStage(newGuesses);
    }
  };

  const handleSkip = () => {
    if (gameStatus !== 'PLAYING') return;
    const newGuesses = [...guesses, 'Pas Geçildi'];
    setGuesses(newGuesses);
    advanceStage(newGuesses);
  };

  // Pes Etme Fonksiyonu
  const handleGiveUp = () => {
    if (gameStatus !== 'PLAYING') return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);

    // Kalan hakları doldur ve oyunu kaybettir
    const remainingSlots = 6 - guesses.length;
    const filledGuesses = [...guesses, ...Array(remainingSlots).fill('Pes Edildi')];
    setGuesses(filledGuesses);
    setGameStatus('LOST');
  };

  const advanceStage = (currentGuesses: string[]) => {
    if (stageIndex < STAGES.length - 1) {
      setStageIndex((prev) => prev + 1);
    } else {
      setGameStatus('LOST');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-6 select-none font-sans">
      <header className="border-b border-slate-800 w-full max-w-md pb-4 mb-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-wider text-emerald-400">MELODLE</h1>
        <p className="text-xs text-slate-400 mt-1">Türkçe Rock Tahmin Oyunu</p>
      </header>

      {targetSong && (
        <audio
          ref={audioRef}
          src={targetSong.preview}
          preload="auto"
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div className="w-full max-w-md flex flex-col gap-5">
        {/* İlerleme Barları */}
        <div className="grid grid-cols-6 gap-1.5">
          {STAGES.map((_, idx) => {
            const isFilled = idx < guesses.length;
            const isCurrent = idx === stageIndex && gameStatus === 'PLAYING';
            return (
              <div
                key={idx}
                className={`h-2 rounded-full transition-all duration-300 ${
                  isFilled
                    ? guesses[idx] === `${currentSongLocal?.artist} - ${currentSongLocal?.title}`
                      ? 'bg-emerald-500'
                      : 'bg-red-500'
                    : isCurrent
                    ? 'bg-slate-400 ring-2 ring-emerald-400'
                    : 'bg-slate-800'
                }`}
              />
            );
          })}
        </div>

        {/* Tahmin Kutuları */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className={`h-10 border rounded-lg px-3 flex items-center text-xs font-medium truncate ${
                guesses[idx]
                  ? guesses[idx] === `${currentSongLocal?.artist} - ${currentSongLocal?.title}`
                    ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                    : 'border-red-900/60 bg-red-950/20 text-slate-300'
                  : 'border-slate-800/80 bg-slate-900/50 text-slate-600'
              }`}
            >
              {guesses[idx] || (idx === stageIndex && gameStatus === 'PLAYING' ? '...' : '')}
            </div>
          ))}
        </div>

        {/* Oynatıcı Kontrol Alanı */}
        <div className="flex flex-col items-center justify-center gap-3 bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
          <button
            onClick={playAudioSnippet}
            disabled={isLoading}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-slate-950 text-xl font-bold transition-all active:scale-95 shadow-lg cursor-pointer ${
              isLoading
                ? 'bg-slate-700 animate-pulse text-transparent'
                : isPlaying
                ? 'bg-amber-400 shadow-amber-500/20'
                : 'bg-emerald-400 shadow-emerald-500/20'
            }`}
          >
            {isLoading ? '...' : isPlaying ? '■' : '▶'}
          </button>
          <span className="text-xs font-semibold text-slate-400">
            {isLoading
              ? 'Şarkı Yükleniyor...'
              : gameStatus === 'PLAYING'
              ? `Dinleme Süresi: ${STAGES[stageIndex]} sn`
              : 'Şarkının Önizlemesini Dinle (30 sn)'}
          </span>
        </div>

        {/* Oyun Sonu Kartı & Sıradaki Şarkı */}
        {gameStatus !== 'PLAYING' && targetSong && currentSongLocal && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4 shadow-lg">
              <img
                src={targetSong.album.cover_medium}
                alt="Albüm Kapağı"
                className="w-16 h-16 rounded-lg object-cover border border-slate-700"
              />
              <div className="overflow-hidden">
                <p className={`text-xs font-bold ${gameStatus === 'WON' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {gameStatus === 'WON' ? 'TEBRİKLER! BİLDİN 👏' : 'PES ETTİN / BİLEMEDİN 😔'}
                </p>
                <h3 className="font-bold text-white text-sm truncate">{currentSongLocal.title}</h3>
                <p className="text-xs text-slate-400 truncate">{currentSongLocal.artist}</p>
              </div>
            </div>

            <button
              onClick={handleNextSong}
              disabled={isLoading}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              {isLoading ? 'Yükleniyor...' : 'Sıradaki Şarkıya Geç ⏭️'}
            </button>
          </div>
        )}

        {/* Arama Kutusu ve Alt Butonlar */}
        {gameStatus === 'PLAYING' && (
          <div className="relative flex flex-col gap-2.5">
            <div className="relative">
              <input
                type="text"
                placeholder="Şarkı veya sanatçı adı ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors text-slate-100 placeholder:text-slate-500"
              />

              {/* Autocomplete Dropdown Listesi */}
              {filteredSongs.length > 0 && (
                <div className="absolute bottom-full mb-2 w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl z-20">
                  {filteredSongs.map((song) => (
                    <button
                      key={song.id}
                      onClick={() => handleGuess(song)}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-800 flex items-center justify-between border-b border-slate-800/50 last:border-0 transition-colors cursor-pointer"
                    >
                      <span className="text-xs font-medium text-slate-200 truncate">
                        {song.artist} - {song.title}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pas Geç ve Pes Et Yan Yana */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleSkip}
                className="py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Pas Geç (+{STAGES[stageIndex + 1] ? `${STAGES[stageIndex + 1] - STAGES[stageIndex]}s` : 'Son'})
              </button>

              <button
                onClick={handleGiveUp}
                className="py-2.5 bg-red-950/40 hover:bg-red-900/50 border border-red-900/50 text-red-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Pes Et 🏳️
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}