import { format, formatDistanceToNow, isToday, isYesterday, isThisYear } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export const formatMessageTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  
  if (isToday(date)) {
    return format(date, 'HH:mm')
  }
  
  if (isYesterday(date)) {
    return '昨天 ' + format(date, 'HH:mm')
  }
  
  if (isThisYear(date)) {
    return format(date, 'M月d日 HH:mm')
  }
  
  return format(date, 'yyyy年M月d日 HH:mm')
}

export const formatSessionTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  
  if (isToday(date)) {
    return format(date, 'HH:mm')
  }
  
  if (isYesterday(date)) {
    return '昨天'
  }
  
  if (isThisYear(date)) {
    return format(date, 'M月d日')
  }
  
  return format(date, 'yyyy/M/d')
}

export const formatRelativeTime = (timestamp: number): string => {
  return formatDistanceToNow(new Date(timestamp), {
    addSuffix: true,
    locale: zhCN,
  })
}
