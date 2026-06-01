import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-72"
      rows={6}
      columns={5}
      tableLabel="Loading Cosmos feegrant allowances"
      toolbars={2}
    />
  );
}
