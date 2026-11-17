# Interceptor, layered variant (try-out): the scout3 multi-hull layout stretched to 23 m in red/black/silver.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from scout import build as base
PAL = dict(hull=0x3a3f48, plate=0xb9bec6, dark=0x1e2228, accent=0xc0262c, glow=(0.6, 1.6, 3.6), win=(3.2, 1.8, 0.6))
def build():
    return base('hull_interceptor', 23.0)
if __name__ == '__main__':
    from kit import run
    name = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else 'interceptor'
    run(build, name, PAL, 23.0, 5.0, 2.5)
