import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Maximize2, Minimize2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useFile } from '@/lib/hooks/use-files';
import { getFilePreviewUrl, getFileDownloadUrl } from '@/lib/api/files';
import { downloadAndShareFile } from '@/lib/hooks/use-download';
import { formatFileSize, formatDate } from '@/lib/format';
import { FileIcon } from '@/components/file/file-icon';
import { ZoomableImage } from '@/components/file/zoomable-image';
import Toast from 'react-native-toast-message';
import type { DriveFile } from '@/lib/types';

// Matches frontend/src/components/files/FilePreviewModal.tsx's structure:
// this screen now owns the previewUrl/quality poll (was previously buried
// inside PreviewContent, one-shot, no upgrade path) so a preview that's
// still on the thumbnail tier when the screen opens quietly upgrades on
// screen once the backfill/preview worker catches up, exactly like web.

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={{ flex: 1 }}
      contentFit="contain"
      nativeControls
    />
  );
}

function AudioPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={{ width: 300, height: 60, marginTop: 20 }}
      nativeControls
    />
  );
}

function PreviewContent({
  file, previewUrl, quality, chromeVisible, onImageTap,
}: {
  file: DriveFile;
  previewUrl: string | null;
  quality: 'thumbnail' | 'preview' | 'original' | null;
  chromeVisible: boolean;
  onImageTap: () => void;
}) {
  if (!previewUrl) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <FileIcon mimeType={file.mimeType} size={64} />
        <Text style={{ color: 'white', marginTop: 16, fontSize: 16 }}>No preview available</Text>
        <Text style={{ color: '#94a3b8', marginTop: 4, fontSize: 14 }}>Tap download to open this file</Text>
      </View>
    );
  }

  // Images — full progressive-load + pinch/pan/double-tap zoom, see
  // ZoomableImage for the tier-chasing logic.
  if (file.mimeType.startsWith('image/')) {
    return (
      <ZoomableImage
        fileId={file.id}
        fullUrl={previewUrl}
        quality={quality}
        chromeVisible={chromeVisible}
        onImageTap={onImageTap}
      />
    );
  }

  // Video
  if (file.mimeType.startsWith('video/')) {
    return <VideoPreview uri={previewUrl} />;
  }

  // Audio — use video player with native controls (handles audio playback)
  if (file.mimeType.startsWith('audio/')) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="musical-notes" size={64} color="#6366f1" />
        <Text style={{ color: 'white', marginTop: 16, fontSize: 16 }}>{file.name}</Text>
        <AudioPreview uri={previewUrl} />
      </View>
    );
  }

  // PDF — render in WebView
  if (file.mimeType === 'application/pdf') {
    return (
      <WebView
        source={{ uri: previewUrl }}
        style={{ flex: 1, backgroundColor: '#000' }}
        allowsInlineMediaPlayback
      />
    );
  }

  // Text/code files — load in WebView
  if (
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json' ||
    file.mimeType === 'application/xml' ||
    file.mimeType === 'application/javascript'
  ) {
    return (
      <WebView
        source={{ uri: previewUrl }}
        style={{ flex: 1, backgroundColor: '#1e293b' }}
      />
    );
  }

  // Fallback
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <FileIcon mimeType={file.mimeType} size={64} />
      <Text style={{ color: 'white', marginTop: 16, fontSize: 16 }}>No preview available</Text>
      <Text style={{ color: '#94a3b8', marginTop: 4, fontSize: 14 }}>Tap download to open this file</Text>
    </View>
  );
}

export default function FilePreviewScreen() {
  const { fileId, fileIds: fileIdsParam } = useLocalSearchParams<{ fileId: string; folderId: string; fileIds?: string }>();
  const router = useRouter();

  // The list this photo/file was opened from (starred/recent/home/folder --
  // whichever screen the user actually tapped it from), passed as a
  // comma-joined id list by each of those screens. Matches web's `files`
  // prop on FilePreviewModal: paging next/prev walks THIS list, not
  // necessarily this file's parent folder's full contents.
  const fileIds = fileIdsParam ? fileIdsParam.split(',').filter(Boolean) : [];
  const currentIndex = fileIds.indexOf(fileId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < fileIds.length - 1;

  function goPrev() {
    if (!hasPrev) return;
    // setParams (not push/replace) so paging through photos stays a single
    // stack entry -- one back-tap exits the viewer entirely, same as web's
    // modal never pushing new history per photo.
    router.setParams({ fileId: fileIds[currentIndex - 1] });
  }
  function goNext() {
    if (!hasNext) return;
    router.setParams({ fileId: fileIds[currentIndex + 1] });
  }
  const [showInfo, setShowInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<'thumbnail' | 'preview' | 'original' | null>(null);
  // Mobile's version of web's "fullscreen" toggle: this screen is already a
  // fullScreenModal (see app/_layout.tsx), so there's no windowed-vs-fullscreen
  // browser API distinction to mirror here -- the equivalent affordance is
  // hiding the header chrome for max image real estate, same practical
  // effect web's Maximize2 button has (more screen for the photo, less
  // chrome), toggled the same way most native photo viewers do it: the
  // button, or a tap on the image itself.
  const [chromeVisible, setChromeVisible] = useState(true);

  // Unlock orientation for preview, lock back to portrait on unmount
  useEffect(() => {
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const { data } = useFile(fileId);
  const file = data?.file;

  // Fetches previewUrl, and -- if still only the thumbnail stand-in --
  // keeps re-checking every few seconds so a slow backfill/upload that
  // finishes after the screen opened still upgrades on screen instead of
  // staying stuck. Same 20x/3s budget as web.
  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollsLeft = 20;

    setPreviewUrl(null);
    setQuality(null);

    function check() {
      getFilePreviewUrl(fileId)
        .then((data) => {
          if (cancelled) return;
          setPreviewUrl(data.previewUrl);
          setQuality(data.quality);
          if (data.quality === 'thumbnail' && pollsLeft > 0) {
            pollsLeft--;
            pollTimer = setTimeout(check, 3000);
          }
        })
        .catch(async () => {
          if (cancelled) return;
          try {
            const d = await getFileDownloadUrl(fileId);
            if (!cancelled) setPreviewUrl(d.downloadUrl);
          } catch {
            // no URL available
          }
        });
    }
    check();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [fileId]);

  async function handleDownload() {
    if (!file) return;
    setDownloading(true);
    try {
      await downloadAndShareFile(file.id);
      Toast.show({ type: 'success', text1: 'Ready to share', text2: file.name });
    } catch (e) {
      Toast.show({ type: 'error', text1: 'Download failed', text2: e instanceof Error ? e.message : undefined });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Top bar — use SafeAreaView for proper inset */}
        {chromeVisible && (
          <SafeAreaView edges={['top']} style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, minHeight: 44 }}>
              <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
              <Text style={{ color: 'white', fontWeight: '500', fontSize: 16, flex: 1, marginHorizontal: 12 }} numberOfLines={1}>
                {file?.name ?? 'Loading...'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {file?.mimeType.startsWith('image/') && (
                  <TouchableOpacity onPress={() => setChromeVisible(false)} style={{ padding: 8 }}>
                    <Maximize2 size={22} color="white" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowInfo(!showInfo)} style={{ padding: 8 }}>
                  <Ionicons name="information-circle-outline" size={24} color="white" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDownload} disabled={downloading} style={{ padding: 8 }}>
                  {downloading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Ionicons name="download-outline" size={24} color="white" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        )}

        {/* Preview content */}
        <View style={{ flex: 1 }}>
          {file ? (
            <PreviewContent
              file={file}
              previewUrl={previewUrl}
              quality={quality}
              chromeVisible={chromeVisible}
              onImageTap={() => setChromeVisible((v) => !v)}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color="white" />
            </View>
          )}

          {/* Prev/next — mirrors web's ChevronLeft/ChevronRight paging
              through the same list this screen was opened from (see fileIds
              above). Overlaid on the content edges rather than web's
              side-by-side flex layout: there's no spare width to give up on
              a phone screen without shrinking the actual preview. Hidden
              along with the rest of the chrome so they don't obscure a
              maximized image, and while there's nothing to page to. */}
          {chromeVisible && hasPrev && (
            <TouchableOpacity
              onPress={goPrev}
              style={{ position: 'absolute', left: 8, top: '50%', marginTop: -20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={22} color="white" />
            </TouchableOpacity>
          )}
          {chromeVisible && hasNext && (
            <TouchableOpacity
              onPress={goNext}
              style={{ position: 'absolute', right: 8, top: '50%', marginTop: -20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronRight size={22} color="white" />
            </TouchableOpacity>
          )}
        </View>

        {/* Minimal re-show control while chrome is hidden — a bare tap on
            the image already toggles it back (onImageTap above), this is
            just a discoverable fallback in the corner. */}
        {!chromeVisible && (
          <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, right: 0 }}>
            <TouchableOpacity onPress={() => setChromeVisible(true)} style={{ padding: 12 }}>
              <Minimize2 size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </SafeAreaView>
        )}

        {/* Info panel */}
        {showInfo && file && chromeVisible && (
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: 'rgba(15,23,42,0.95)' }}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
              <InfoRow label="Name" value={file.name} />
              <InfoRow label="Type" value={file.mimeType} />
              <InfoRow label="Size" value={formatFileSize(file.size)} />
              <InfoRow label="Modified" value={formatDate(file.updatedAt)} />
              <InfoRow label="Downloads" value={String(file.downloadCount)} />
              {file.description && <InfoRow label="Description" value={file.description} />}
            </View>
          </SafeAreaView>
        )}
      </View>
      </SafeAreaProvider>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ fontSize: 14, color: '#94a3b8' }}>{label}</Text>
      <Text style={{ fontSize: 14, color: 'white', flex: 1, textAlign: 'right', marginLeft: 16 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
