# EchoSim — Ultrasonic Smart Navigation Emulator

An interactive, browser-based emulator that demonstrates how ultrasonic sensing can support obstacle detection and assistive navigation.

[![Live Site](https://img.shields.io/badge/Live_Site-ultrasim.vercel.app-01472e)](https://ultrasim.vercel.app/)

## Overview

EchoSim is a web-based simulation designed to demonstrate the concept of an ultrasonic navigation system. It provides a virtual environment where users can explore surroundings, detect obstacles, and experience simulated audio feedback.

The project aims to make assistive navigation technology easier to understand through an interactive and accessible interface.

## Features

- **Interactive environments:** Explore different preset scenarios, including Hallway, Street, and Blindfold modes.
- **Obstacle detection:** Simulates ultrasonic detection of objects at varying distances.
- **Dynamic obstacles:** Includes moving pedestrians and vehicles.
- **Audio feedback:** Provides simulated distance-based audio cues with stereo panning.
- **Voice announcements:** Uses browser speech synthesis to announce relevant information.
- **Adjustable settings:** Modify detection range and beam spread.
- **Real-time telemetry:** Displays distance, signal intensity, incidence angle, material, and detection status.
- **Interactive controls:** Move around the environment and interact with obstacles.
- **Blindfold mode:** Provides an alternative way to experience the simulation without relying on visual navigation.

## Supported Materials and Objects

The simulation includes different obstacle types to demonstrate variations in detection:

- Concrete walls
- Parked cars
- Moving vehicles
- Glass surfaces
- Acoustic fabric
- Overhangs
- Curbs
- Pedestrians
- Poles and trees

## Controls

| Key | Action |
|---|---|
| W / Up Arrow | Move forward |
| S / Down Arrow | Move backward |
| A | Move left |
| D | Move right |
| Q / Left Arrow | Turn left |
| E / Right Arrow | Turn right |

The application also provides on-screen controls for movement and interaction.

## Technology Stack

- **HTML5** — Application structure
- **CSS3** — Styling and layout
- **JavaScript** — Simulation logic and interactions
- **Canvas API** — Environment and visual rendering
- **Web Audio API** — Simulated audio feedback
- **Web Speech API** — Voice announcements

## Project Structure

```text
EchoSim/
│
├── app/
│   ├── index.html
│   ├── app.js
│   ├── echosim.css
│   └── ascii-art.jpg
│
├── LICENSE
└── README.md
```

## Getting Started

### Run Locally

1. Clone the repository:

   ```bash
   git clone https://github.com/sensei-oh/EchoSim.git
   ```

2. Navigate to the project directory:

   ```bash
   cd EchoSim
   ```

3. Open `app/index.html` in your browser.

Alternatively, use the **Live Server** extension in Visual Studio Code to run the application locally.

## Educational Applications

EchoSim can be used for:

- Understanding the concept of ultrasonic-based obstacle detection.
- Exploring assistive technology for visually impaired individuals.
- Demonstrating interactive simulations using JavaScript.
- Learning about browser-based audio and visual technologies.
- Exploring the potential applications of sensor-based navigation systems.

## Limitations

EchoSim is a software-based emulator. It does not use an actual ultrasonic sensor or provide real-world obstacle detection.

The detection values, material responses, and audio feedback are simulated for demonstration and educational purposes. The application is not a replacement for physical mobility aids or certified navigation devices.

## Future Improvements

Potential future enhancements include:

- Integration with an actual ultrasonic sensor such as the HC-SR04.
- Hardware implementation using Arduino or ESP32.
- Haptic feedback through vibration motors.
- Improved obstacle detection and environmental mapping.
- Additional environments and customization options.

## Contributing

Contributions, suggestions, and improvements are welcome. Feel free to fork the repository and submit a pull request.

## Author

**Janit Sarvaiya**

GitHub: [@sensei-oh](https://github.com/sensei-oh)

Repository: [EchoSim](https://github.com/sensei-oh/EchoSim)

## License

This project is licensed under the [MIT License](LICENSE).
