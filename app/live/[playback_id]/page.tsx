export default async function LiveViewer({
  params,
}: {
  params: Promise<{ playback_id: string }>;
}) {
  const { playback_id } = await params;
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h1 className="text-xl font-semibold">Live (coming in Phase 3)</h1>
      <p className="text-sm text-fg-muted">Playback id: {playback_id}</p>
    </div>
  );
}
