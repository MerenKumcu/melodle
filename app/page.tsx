'use client';

import React, { useState, useEffect, useRef } from 'react';
import rawSongsData from '../data/songs.json';

interface Song {
  id: number;
  title: string;
  artist: { name: string };
  preview: string;
  album: { cover_medium: string };
}

interface LocalSong {
  id: number;
  genre?: string;
  query: string;
  artist: string;
  title: string;
}

type GenreType = 'all' | 'rock' | 'rap' | 'pop';

const STAGES = [1, 2, 4, 7, 11, 16];

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
  const songsData = rawSongsData as LocalSong[];

  const [selectedGenre, setSelectedGenre] = useState<GenreType>('all');
  const [playedIds, setPlayedIds] = useState<number[]>([]);
  const [targetSong, setTargetSong] = useState<Song | null>(null);
  const [currentSongLocal, setCurrentSongLocal] = useState<LocalSong | null>(null);
  
  const [stageIndex, setStageIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [gameStatus, setGameStatus] = useState<'PLAYING' | 'WON' | 'LOST'>('PLAYING');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Arama ve Klavye state'leri
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSongs, setFilteredSongs] = useState<LocalSong[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Kategoriye göre filtrelenmiş şarkı havuzu
  const getPool = (genre: GenreType) => {
    if (genre === 'all') return songsData;
    return songsData.filter((s) => s.genre === genre);
  };

  // Tekrarsız Rastgele Şarkı Seçici
  const getRandomSong = (genre: GenreType, currentPlayed: number[]) => {
    const pool = getPool(genre);
    let available = pool.filter((s) => !currentPlayed.includes(s.id));

    if (available.length === 0) {
      available = pool;
      currentPlayed = [];
    }

    const randomSong = available[Math.floor(Math.random() * available.length)];
    return { song: randomSong, updatedPlayed: [...currentPlayed, randomSong.id] };
  };

  // Şarkıyı yükleme fonksiyonu
  const loadNewSong = async (genre: GenreType) => {
    setIsLoading(true);
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setIsPlaying(false);
    setTargetSong(null);

    const { song, updatedPlayed } = getRandomSong(genre, playedIds);
    setPlayedIds(updatedPlayed);
    setCurrentSongLocal(song);

    setGuesses([]);
    setStageIndex(0);
    setGameStatus('PLAYING');
    setSearchQuery('');
    setFilteredSongs([]);
    setSelectedIndex(-1);

    try {
      const res = await fetch(`/api/deezer?q=${encodeURIComponent(song.query)}`);
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
    loadNewSong(selectedGenre);
  }, [selectedGenre]);

  // Arama filtreleme (limit 30'a çıkarıldı)
  useEffect(() => {
    const query = normalizeText(searchQuery);
    if (query.length < 2) {
      setFilteredSongs([]);
      setSelectedIndex(-1);
      return;
    }

    const pool = getPool(selectedGenre);
    const results = pool.filter((song) => {
      const fullText = normalizeText(`${song.artist} ${song.title}`);
      return fullText.includes(query);
    });

    setFilteredSongs(results.slice(0, 30));
    setSelectedIndex(0);
  }, [searchQuery, selectedGenre]);

  // Klavye ile gezinirken seçili elemanı scroll alanına kaydırma
  useEffect(() => {
    if (dropdownRef.current && selectedIndex >= 0) {
      const activeEl = dropdownRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

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
    audio.play().catch((e) => console.error('Çalma hatası:', e));
    setIsPlaying(true);

    const playDuration = (gameStatus === 'PLAYING' ? STAGES[stageIndex] : 30) * 1000;

    timeoutRef.current = setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
    }, playDuration);
  };

  const handleGuess = (guessedSong: LocalSong) => {
    if (gameStatus !== 'PLAYING' || !currentSongLocal || isLoading) return;

    const guessText = `${guessedSong.artist} - ${guessedSong.title}`;
    const newGuesses = [...guesses, guessText];
    setGuesses(newGuesses);
    setSearchQuery('');
    setFilteredSongs([]);
    setSelectedIndex(-1);

    const isCorrect = guessedSong.id === currentSongLocal.id;

    if (isCorrect) {
      setGameStatus('WON');
    } else {
      advanceStage(newGuesses);
    }
  };

  const handleSkip = () => {
    if (gameStatus !== 'PLAYING' || isLoading) return;
    const newGuesses = [...guesses, 'Pas Geçildi'];
    setGuesses(newGuesses);
    advanceStage(newGuesses);
  };

  const handleGiveUp = () => {
    if (gameStatus !== 'PLAYING' || isLoading) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);

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

  // Klavye yön tuşları ve Enter yönetimi
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredSongs.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredSongs.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredSongs.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filteredSongs.length) {
        handleGuess(filteredSongs[selectedIndex]);
      }
    }
  };

  return (
    <main className="h-screen max-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 select-none font-sans overflow-hidden">
      {/* Üst Başlık & Tür Seçimi */}
      <header className="w-full max-w-md flex flex-col items-center gap-2">
        <h1 className="text-2xl font-black tracking-wider text-emerald-400">MELODLE</h1>
        
        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1 gap-1 text-xs font-semibold flex-wrap justify-center">
          <button
            onClick={() => !isLoading && setSelectedGenre('all')}
            className={`px-3 py-1 rounded-md transition-colors ${
              selectedGenre === 'all' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Karışık
          </button>
          <button
            onClick={() => !isLoading && setSelectedGenre('rock')}
            className={`px-3 py-1 rounded-md transition-colors ${
              selectedGenre === 'rock' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Türkçe Rock
          </button>
          <button
            onClick={() => !isLoading && setSelectedGenre('rap')}
            className={`px-3 py-1 rounded-md transition-colors ${
              selectedGenre === 'rap' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Türkçe Rap
          </button>
          <button
            onClick={() => !isLoading && setSelectedGenre('pop')}
            className={`px-3 py-1 rounded-md transition-colors ${
              selectedGenre === 'pop' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Türkçe Pop
          </button>
        </div>
      </header>

      {/* Audio Elemanı */}
      <audio
        ref={audioRef}
        src={targetSong?.preview || ''}
        preload="auto"
        onEnded={() => setIsPlaying(false)}
      />

      {/* Ana Oyun Alanı */}
      <div className="w-full max-w-md flex flex-col gap-3 my-auto">
        {/* İlerleme Barları */}
        <div className="grid grid-cols-6 gap-1.5">
          {STAGES.map((_, idx) => {
            const isFilled = idx < guesses.length;
            const isCurrent = idx === stageIndex && gameStatus === 'PLAYING';
            return (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
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
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className={`h-8 border rounded-lg px-3 flex items-center text-xs font-medium truncate ${
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
        <div className="flex flex-col items-center justify-center gap-2 bg-slate-900 p-3.5 rounded-xl border border-slate-800 shadow-md">
          <button
            onClick={playAudioSnippet}
            disabled={isLoading || !targetSong}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-slate-950 text-lg font-bold transition-all active:scale-95 shadow-md cursor-pointer ${
              isLoading || !targetSong
                ? 'bg-slate-700 animate-pulse text-transparent'
                : isPlaying
                ? 'bg-amber-400 shadow-amber-500/20'
                : 'bg-emerald-400 shadow-emerald-500/20'
            }`}
          >
            {isLoading || !targetSong ? '...' : isPlaying ? '■' : '▶'}
          </button>
          <span className="text-[11px] font-semibold text-slate-400">
            {isLoading || !targetSong
              ? 'Yeni Şarkı Yükleniyor...'
              : gameStatus === 'PLAYING'
              ? `Dinleme Süresi: ${STAGES[stageIndex]} sn`
              : 'Şarkının Önizlemesini Dinle (30 sn)'}
          </span>
        </div>

        {/* Oyun Sonu Kartı & Sıradaki Şarkı */}
        {gameStatus !== 'PLAYING' && currentSongLocal && (
          <div className="flex flex-col gap-2 animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3 shadow-md">
              {targetSong?.album?.cover_medium && (
                <img
                  src={targetSong.album.cover_medium}
                  alt="Albüm Kapağı"
                  className="w-12 h-12 rounded-lg object-cover border border-slate-700"
                />
              )}
              <div className="overflow-hidden">
                <p className={`text-[10px] font-bold ${gameStatus === 'WON' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {gameStatus === 'WON' ? 'TEBRİKLER! BİLDİN 👏' : 'BİLEMEDİN / PES ETTİN 😔'}
                </p>
                <h3 className="font-bold text-white text-xs truncate">{currentSongLocal.title}</h3>
                <p className="text-[11px] text-slate-400 truncate">{currentSongLocal.artist}</p>
              </div>
            </div>

            <button
              onClick={() => loadNewSong(selectedGenre)}
              disabled={isLoading}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1"
            >
              {isLoading ? 'Yükleniyor...' : 'Sıradaki Şarkıya Geç ⏭️'}
            </button>
          </div>
        )}

        {/* Arama Kutusu ve Butonlar */}
        {gameStatus === 'PLAYING' && (
          <div className="relative flex flex-col gap-2">
            <div className="relative">
              <input
                type="text"
                disabled={isLoading}
                placeholder="Şarkı veya sanatçı adı ara (↑↓ ve Enter)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-emerald-500 transition-colors text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
              />

              {/* Kaydırılabilir Autocomplete Dropdown Listesi */}
              {filteredSongs.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute bottom-full mb-1.5 w-full bg-slate-900 border border-slate-800 rounded-xl overflow-y-auto max-h-48 shadow-2xl z-20"
                >
                  {filteredSongs.map((song, idx) => (
                    <button
                      key={song.id}
                      onClick={() => handleGuess(song)}
                      className={`w-full text-left px-3.5 py-2 flex items-center justify-between border-b border-slate-800/50 last:border-0 transition-colors cursor-pointer ${
                        idx === selectedIndex ? 'bg-slate-800 text-emerald-400' : 'text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="text-xs font-medium truncate">
                        {song.artist} - {song.title}
                      </span>
                      <span className="text-[10px] text-slate-500 uppercase ml-2 shrink-0">{song.genre}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pas Geç ve Pes Et Yan Yana */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleSkip}
                disabled={isLoading}
                className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Pas Geç (+{STAGES[stageIndex + 1] ? `${STAGES[stageIndex + 1] - STAGES[stageIndex]}s` : 'Son'})
              </button>

              <button
                onClick={handleGiveUp}
                disabled={isLoading}
                className="py-2 bg-red-950/40 hover:bg-red-900/50 border border-red-900/50 text-red-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Pes Et 🏳️
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Deezer Footer */}
      <footer className="text-center text-[10px] text-slate-500">
        Müzik önizlemeleri Deezer API üzerinden sağlanmaktadır.
      </footer>
    </main>
  );
}