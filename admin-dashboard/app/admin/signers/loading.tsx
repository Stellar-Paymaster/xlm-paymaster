import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-64"
      rows={6}
      columns={5}
      tableLabel="Loading signer pool"
      toolbars={2}
    />
  );
}
