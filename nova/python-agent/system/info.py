import psutil
import platform
import time
from datetime import datetime

def get_system_telemetry() -> dict:
    try:
        cpu_pct = psutil.cpu_percent(interval=0.1)
        cpu_count = psutil.cpu_count(logical=True)
        cpu_freq = psutil.cpu_freq()
        
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        
        # Disk usage for primary drive
        try:
            disk = psutil.disk_usage("C:\\" if platform.system() == "Windows" else "/")
            disk_info = {
                "total_gb": round(disk.total / (1024 ** 3), 1),
                "used_gb": round(disk.used / (1024 ** 3), 1),
                "free_gb": round(disk.free / (1024 ** 3), 1),
                "percent": disk.percent
            }
        except Exception:
            disk_info = {"percent": 0, "used_gb": 0, "total_gb": 0}

        # Battery if available
        battery_info = None
        try:
            bat = psutil.sensors_battery()
            if bat:
                battery_info = {
                    "percent": bat.percent,
                    "power_plugged": bat.power_plugged,
                    "secsleft": bat.secsleft
                }
        except Exception:
            pass

        boot_time = datetime.fromtimestamp(psutil.boot_time()).strftime("%Y-%m-%d %H:%M:%S")
        uptime_seconds = int(time.time() - psutil.boot_time())

        return {
            "success": True,
            "os": f"{platform.system()} {platform.release()} ({platform.machine()})",
            "hostname": platform.node(),
            "uptime_seconds": uptime_seconds,
            "boot_time": boot_time,
            "cpu": {
                "percent": cpu_pct,
                "cores": cpu_count,
                "freq_mhz": round(cpu_freq.current, 1) if cpu_freq else None
            },
            "memory": {
                "percent": mem.percent,
                "used_gb": round(mem.used / (1024 ** 3), 2),
                "total_gb": round(mem.total / (1024 ** 3), 2),
                "available_gb": round(mem.available / (1024 ** 3), 2)
            },
            "swap": {
                "percent": swap.percent,
                "used_gb": round(swap.used / (1024 ** 3), 2)
            },
            "disk": disk_info,
            "battery": battery_info,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def get_top_processes(limit: int = 8) -> dict:
    try:
        processes = []
        for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                info = p.info
                if info['name'] and info['cpu_percent'] is not None:
                    processes.append({
                        "pid": info['pid'],
                        "name": info['name'],
                        "cpu": round(info['cpu_percent'], 1),
                        "memory": round(info['memory_percent'] or 0, 1)
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
                
        # Sort by cpu usage
        sorted_procs = sorted(processes, key=lambda x: x['cpu'], reverse=True)[:limit]
        return {"success": True, "processes": sorted_procs}
    except Exception as e:
        return {"success": False, "error": str(e)}
