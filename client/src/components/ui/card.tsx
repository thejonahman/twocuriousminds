import * as React from "react"
import { motion, type HTMLMotionProps } from "framer-motion"
import { cn } from "@/lib/utils"

type DivProps = React.HTMLAttributes<HTMLDivElement>
type MotionDivProps = Omit<HTMLMotionProps<"div">, keyof DivProps> & DivProps

const Card = React.forwardRef<HTMLDivElement, MotionDivProps>(
  ({ className, ...props }, ref) => (
    <motion.div
      ref={ref}
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      whileHover={{ 
        scale: 1.02,
        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.12)"
      }}
      transition={{ 
        type: "spring",
        stiffness: 300,
        damping: 20
      }}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<HTMLDivElement, MotionDivProps>(
  ({ className, ...props }, ref) => (
    <motion.div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        delay: 0.1,
        type: "spring",
        stiffness: 500,
        damping: 30
      }}
      {...props}
    />
  )
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  Omit<HTMLMotionProps<"h3">, keyof React.HTMLAttributes<HTMLHeadingElement>> & 
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <motion.h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ 
      delay: 0.2,
      type: "spring",
      stiffness: 500
    }}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  Omit<HTMLMotionProps<"p">, keyof React.HTMLAttributes<HTMLParagraphElement>> &
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <motion.p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.3 }}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, MotionDivProps>(
  ({ className, ...props }, ref) => (
    <motion.div
      ref={ref}
      className={cn("p-6 pt-0", className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        delay: 0.4,
        type: "spring",
        stiffness: 500,
        damping: 30
      }}
      {...props}
    />
  )
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, MotionDivProps>(
  ({ className, ...props }, ref) => (
    <motion.div
      ref={ref}
      className={cn("flex items-center p-6 pt-0", className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        delay: 0.5,
        type: "spring",
        stiffness: 500,
        damping: 30
      }}
      {...props}
    />
  )
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }