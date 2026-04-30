interface HostSessionPageProps {
  params: Promise<{
    pin: string;
  }>;
}

export default async function HostSessionPage({ params }: HostSessionPageProps) {
  const { pin } = await params;

  return <main>Host session {pin}</main>;
}
