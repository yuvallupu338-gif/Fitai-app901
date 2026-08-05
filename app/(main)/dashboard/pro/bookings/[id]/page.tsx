import { redirect } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

/** פרטי ההזמנה מוצגים במסך משותף לשני הצדדים. */
export default async function ProBookingDetailsPage({ params }: Props) {
  const { id } = await params;
  redirect(`/dashboard/bookings/${id}`);
}
