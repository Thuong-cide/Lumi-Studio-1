import { useGetAdminStats, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Users, Building2, Image as ImageIcon, Camera, Heart } from "lucide-react";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats({
    query: {
      queryKey: getGetAdminStatsQueryKey(),
    }
  });

  if (isLoading) {
    return <div className="p-8 font-serif text-xl animate-pulse text-muted-foreground">Đang tải dữ liệu...</div>;
  }

  if (!stats) return null;

  const cards = [
    { title: "Tổng số Studio", value: stats.totalStudios, icon: Building2 },
    { title: "Studio đang chờ", value: stats.pendingStudios, icon: Users },
    { title: "Studio đã duyệt", value: stats.approvedStudios, icon: Users },
    { title: "Tổng số Album", value: stats.totalAlbums, icon: ImageIcon },
    { title: "Tổng số Ảnh", value: stats.totalPhotos, icon: Camera },
    { title: "Lượt chọn ảnh", value: stats.totalSelections, icon: Heart },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-serif font-bold text-foreground">Tổng quan Nền tảng</h1>
      </div>

      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {cards.map((card, i) => (
          <motion.div key={i} variants={item}>
            <Card className="hover-elevate no-default-hover-elevate hover:shadow-md transition-shadow duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-serif font-bold text-foreground">{card.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
