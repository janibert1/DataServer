import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useFile } from '@/lib/hooks/use-files';
import { getFilePreviewUrl, getFileDownloadUrl } from '@/lib/api/files';
import { downloadAndShareFile } from '@/lib/hooks/use-download';
import { formatFileSize, formatDate } from '@/lib/format';
import { FileIcon } from '@/components/file/file-icon';
import Toast from 'react-native-toast-message';
import type { DriveFile } from '@/lib/types';

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

function PreviewContent({ file }: { file: DriveFile }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadUrl() {
      try {
        // For all file types, get the signed S3 URL via the preview endpoint
        const data = await getFilePreviewUrl(file.id);
        if (!cancelled) setSignedUrl(data.previewUrl);
      } catch {
        // If preview fails, try the download URL (works for all files)
        try {
          const data = await getFileDownloadUrl(file.id);
          if (!cancelled) setSignedUrl(data.downloadUrl);
        } catch {
          // No URL available
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUrl();
    return () => { cancelled = true; };
  }, [file.id]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="white" />
      </View>
    );
  }

  if (!signedUrl) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <FileIcon mimeType={file.mimeType} size={64} />
        <Text style={{ color: 'white', marginTop: 16, fontSize: 16 }}>No preview available</Text>
        <Text style={{ color: '#94a3b8', marginTop: 4, fontSize: 14 }}>Tap download to open this file</Text>
      </View>
    );
  }

  // Images
  if (file.mimeType.startsWith('image/')) {
    return (
      <Image
        source={{ uri: signedUrl }}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
      />
    );
  }

  // Video
  if (file.mimeType.startsWith('video/')) {
    return <VideoPreview uri={signedUrl} />;
  }

  // Audio — use video player with native controls (handles audio playback)
  if (file.mimeType.startsWith('audio/')) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="musical-notes" size={64} color="#6366f1" />
        <Text style={{ color: 'white', marginTop: 16, fontSize: 16 }}>{file.name}</Text>
        <AudioPreview uri={signedUrl} />
      </View>
    );
  }

  // PDF — render in WebView
  if (file.mimeType === 'application/pdf') {
    return (
      <WebView
        source={{ uri: signedUrl }}
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
        source={{ uri: signedUrl }}
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
  const { fileId } = useLocalSearchParams<{ fileId: string; folderId: string }>();
  const router = useRouter();
  const [showInfo, setShowInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Unlock orientation for preview, lock back to portrait on unmount
  useEffect(() => {
    ScreenOrientation.unlockAsync();
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const { data } = useFile(fileId);
  const file = data?.file;

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
        <SafeAreaView edges={['top']} style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, minHeight: 44 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
            <Text style={{ color: 'white', fontWeight: '500', fontSize: 16, flex: 1, marginHorizontal: 12 }} numberOfLines={1}>
              {file?.name ?? 'Loading...'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
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

        {/* Preview content */}
        <View style={{ flex: 1 }}>
          {file ? (
            <PreviewContent file={file} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator size="large" color="white" />
            </View>
          )}
        </View>

        {/* Info panel */}
        {showInfo && file && (
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
