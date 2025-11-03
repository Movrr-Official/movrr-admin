"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { staggerContainer, fadeInUp } from "@/lib/animations"

export function RiderCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center space-x-4">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-4 w-18" />
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className="h-8 w-full mt-4" />
        </div>
      </CardContent>
    </Card>
  )
}

export function RidersSkeleton() {
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      {/* Header Skeleton */}
      <motion.div variants={fadeInUp} className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-28" />
      </motion.div>

      {/* Filters Skeleton */}
      <motion.div variants={fadeInUp} className="flex items-center space-x-4">
        <Skeleton className="h-10 flex-1 max-w-md" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-32" />
      </motion.div>

      {/* Riders Grid Skeleton */}
      <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <motion.div key={i} variants={fadeInUp}>
            <RiderCardSkeleton />
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
