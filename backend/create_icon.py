"""Generate application icon for ACM Helper."""
from PIL import Image, ImageDraw

def create_icon():
    # Create a 256x256 image with dark background
    size = 256
    img = Image.new('RGBA', (size, size), (31, 41, 55, 255))  # Dark gray
    draw = ImageDraw.Draw(img)
    
    # Draw a green code bracket symbol
    green = (34, 197, 94)  # Green-500
    
    # Left bracket <
    bracket_width = 20
    draw.polygon([
        (80, 128),   # tip
        (120, 70),   # top
        (140, 70),
        (100, 128),
        (140, 186),
        (120, 186),
    ], fill=green)
    
    # Right bracket >
    draw.polygon([
        (176, 128),  # tip
        (136, 70),   # top
        (116, 70),
        (156, 128),
        (116, 186),
        (136, 186),
    ], fill=green)
    
    # Save as ICO
    img.save('icon.ico', format='ICO', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print("icon.ico created successfully!")

if __name__ == "__main__":
    create_icon()
