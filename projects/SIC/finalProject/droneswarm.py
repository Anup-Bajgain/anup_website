import tkinter as tk
from tkinter import ttk
import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
import time
import threading
import math
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

# --- Obstacle Class (Pillar) ---
class Pillar:
    def __init__(self, base_position, height, radius):
        self.base_position = np.array(base_position, dtype=float) # Center of the base
        self.height = height
        self.radius = radius

    def is_inside(self, position):
        # Check if a point is inside the cylinder
        dx = position[0] - self.base_position[0]
        dy = position[1] - self.base_position[1]
        dist_sq = dx**2 + dy**2
        is_within_radius = dist_sq <= self.radius**2
        is_within_height = position[2] >= self.base_position[2] and position[2] <= self.base_position[2] + self.height
        return is_within_radius and is_within_height

# --- Drone Class ---
class Drone:
    def __init__(self, drone_id, position, velocity=None):
        self.id = drone_id
        self.position = np.array(position, dtype=float)
        self.velocity = np.array(velocity if velocity is not None else [0.0, 0.0, 0.0], dtype=float)
        self.target_position = np.array(position, dtype=float) # Used in Pattern Formation mode
        self.max_speed = 4.0 # Increased max speed for potentially faster movement
        self.arrival_threshold_pattern = 0.2 # Distance threshold to consider target reached in pattern mode

        # Control gains for Pattern Formation (PD Controller)
        self.Kp_pattern = 0.5 # Proportional gain
        self.Kd_pattern = 0.5 # Derivative gain (damping)


        # Control gains for Obstacle Avoidance (Tuned for stronger flocking/goal seeking)
        self.goal_seeking_strength_boids = 0.4 # Strength of force towards goal in avoidance mode (Boids)
        self.cohesion_strength = 0.1 # Strength of cohesion force
        self.alignment_strength = 0.1 # Strength of alignment force
        self.avoidance_radius = 3.0 # Radius around drone for avoidance
        self.repulsion_strength = 2.5 # Strength of repulsive force

        # PID gains for Obstacle Avoidance (PID Controller)
        self.Kp_pid = 0.8 # Proportional gain
        self.Ki_pid = 0.01 # Integral gain
        self.Kd_pid = 0.5 # Derivative gain
        self.integral_error = np.array([0.0, 0.0, 0.0]) # Integral term for PID

        self.arrival_threshold_goal = 2.0 # Distance threshold to consider goal reached in avoidance mode

        self.eliminated = False # Flag to mark if drone is eliminated
        self.reached_goal = False # Flag to mark if drone reached the end box
        self.time_to_goal = -1.0 # Time taken to reach the goal (-1 if not reached)

        # For conceptual communication/path following (Placeholder)
        self.path_taken = [] # Store trajectory points
        self.broadcast_info = {} # Information to broadcast (id, cost, trajectory - simplified)

        # Store previous error for derivative term in PID
        self.previous_error = np.array([0.0, 0.0, 0.0])


    def calculate_pattern_force(self):
        # Force towards the pattern target using PD control
        position_error = self.target_position - self.position
        velocity_error = np.array([0.0, 0.0, 0.0]) - self.velocity # Desired velocity is zero at target

        # PD control law: Force = Kp * position_error + Kd * velocity_error
        pattern_force = self.Kp_pattern * position_error + self.Kd_pattern * velocity_error

        # Check if close enough to the target to stop
        distance_to_target = np.linalg.norm(position_error)
        if distance_to_target < self.arrival_threshold_pattern and np.linalg.norm(self.velocity) < 0.1: # Also check if velocity is low
             return np.array([0.0, 0.0, 0.0]) # Stop when close and slow

        # Limit force magnitude
        force_magnitude = np.linalg.norm(pattern_force)
        if force_magnitude > self.max_speed: # Using max_speed as a proxy for max force
             pattern_force = pattern_force / force_magnitude * self.max_speed

        return pattern_force

    def calculate_pid_force(self, goal_position, dt):
        """Calculates force using a PID controller towards the goal."""
        error = goal_position - self.position

        # Proportional term
        P_term = self.Kp_pid * error

        # Integral term (accumulate error over time)
        self.integral_error += error * dt
        I_term = self.Ki_pid * self.integral_error

        # Derivative term (based on change in error)
        derivative_error = (error - self.previous_error) / dt if dt > 0 else np.array([0.0, 0.0, 0.0])
        D_term = self.Kd_pid * derivative_error
        self.previous_error = error.copy()
        pid_force = P_term + I_term + D_term
        distance_to_goal = np.linalg.norm(error)
        if distance_to_goal < self.arrival_threshold_goal and np.linalg.norm(self.velocity) < 0.1: # Also check if velocity is low
             return np.array([0.0, 0.0, 0.0]) # Stop when close and slow


        # Limit force magnitude
        force_magnitude = np.linalg.norm(pid_force)
        if force_magnitude > self.max_speed: # Using max_speed as a proxy for max force
             pid_force = pid_force / force_magnitude * self.max_speed

        return pid_force


    def calculate_goal_force_boids(self, goal_position):
        # Force towards a fixed goal position (used in Obstacle Avoidance mode with Boids)
        direction_to_goal = goal_position - self.position
        distance_to_goal = np.linalg.norm(direction_to_goal)

        if distance_to_goal > self.arrival_threshold_goal:
            # Force towards goal, scaled by goal_seeking_strength
            goal_force = direction_to_goal / distance_to_goal * self.goal_seeking_strength_boids
            return goal_force
        else:
             # Return zero force if within arrival threshold to prevent oscillation near goal
             return np.array([0.0, 0.0, 0.0])


    def calculate_avoidance_force(self, swarm, obstacles):
        avoidance_force = np.array([0.0, 0.0, 0.0])
        neighbor_positions = []
        neighbor_velocities = []
        swarm_center = np.array([0.0, 0.0, 0.0])
        neighbor_count = 0

        # Avoid other drones and calculate swarm properties for Boids
        for other_drone in swarm.drones:
            # Consider only active neighbors for Boids forces
            if other_drone.id != self.id and not other_drone.eliminated and not other_drone.reached_goal:
                dist_between_drones = np.linalg.norm(self.position - other_drone.position)
                if dist_between_drones < self.avoidance_radius:
                    neighbor_positions.append(other_drone.position)
                    neighbor_velocities.append(other_drone.velocity)
                    swarm_center += other_drone.position
                    neighbor_count += 1
                    if dist_between_drones > 1e-6:
                        repel_direction = (self.position - other_drone.position) / dist_between_drones
                        # Repulsion strength increases as drones get closer
                        avoidance_force += repel_direction * (self.repulsion_strength / dist_between_drones**2) # Inverse square law repulsion

        # Calculate Boids forces if there are neighbors
        cohesion_force = np.array([0.0, 0.0, 0.0])
        alignment_force = np.array([0.0, 0.0, 0.0])

        if neighbor_count > 0:
            # Cohesion: move towards the average position of neighbors
            average_position = swarm_center / neighbor_count
            cohesion_force = (average_position - self.position) * self.cohesion_strength

            # Alignment: steer towards the average velocity of neighbors
            average_velocity = np.mean(neighbor_velocities, axis=0)
            if np.linalg.norm(average_velocity) > 1e-6:
                 alignment_force = (average_velocity / np.linalg.norm(average_velocity) - self.velocity / np.linalg.norm(self.velocity + 1e-6)) * self.alignment_strength # Avoid division by zero


        # Avoid pillar obstacles
        for obstacle in obstacles:
            # Check distance to the cylinder's central axis in XY plane
            dx = self.position[0] - obstacle.base_position[0]
            dy = self.position[1] - obstacle.base_position[1]
            dist_to_axis_sq = dx**2 + dy**2
            dist_to_axis = np.sqrt(dist_to_axis_sq)

            # Check if within avoidance height range of the pillar
            is_within_pillar_height = self.position[2] >= obstacle.base_position[2] and self.position[2] <= obstacle.base_position[2] + obstacle.height

            if dist_to_axis < (obstacle.radius + self.avoidance_radius) and is_within_pillar_height:
                # Calculate repulsion force away from the cylinder surface
                if dist_to_axis > 1e-6:
                    repel_direction_xy = np.array([dx, dy, 0]) / dist_to_axis
                    # Repulsion strength increases as drone gets closer to the pillar surface
                    avoidance_strength = self.repulsion_strength * (1.0 / (dist_to_axis - obstacle.radius + 1e-6)) # Repel strongly near surface
                    avoidance_force += repel_direction_xy * avoidance_strength

        return avoidance_force, cohesion_force, alignment_force

    def update(self, dt, swarm):
        # If eliminated or reached goal, do not update position or velocity
        if self.eliminated or self.reached_goal:
            return

        total_force = np.array([0.0, 0.0, 0.0])

        # Calculate forces based on simulation mode
        if swarm.mode == 'pattern_formation':
            total_force += self.calculate_pattern_force()
            # Only avoid other drones in pattern mode
            avoidance_force, _, _ = self.calculate_avoidance_force(swarm, [])
            total_force += avoidance_force

        elif swarm.mode == 'obstacle_avoidance':
            # PID controller is the default for obstacle avoidance mode
            total_force += self.calculate_pid_force(swarm.end_box_center, dt)
            # Avoid other drones and obstacles
            avoidance_force, _, _ = self.calculate_avoidance_force(swarm, swarm.obstacles) # Only use avoidance part
            total_force += avoidance_force

            self.path_taken.append(self.position.copy())

        self.velocity += total_force * dt

        # Limit velocity to max speed
        speed = np.linalg.norm(self.velocity)
        if speed > self.max_speed:
            self.velocity = self.velocity / speed * self.max_speed

        self.position += self.velocity * dt

        # --- Boundary Checks and Elimination in Obstacle Avoidance Mode ---
        if swarm.mode == 'obstacle_avoidance':
             # Define bounds based on the simulation area and start/end boxes
             min_x = -swarm.area_size / 2 - 5 # Add some buffer
             max_x = swarm.area_size / 2 + 5
             min_y = swarm.start_box_center[1] - swarm.start_box_size/2 - 5 # Start from slightly before start box
             max_y = swarm.end_box_center[1] + swarm.end_box_size/2 + 5 # End slightly after end box
             min_z = 0 # Assume ground is at Z=0
             max_z = swarm.area_size / 2 + 5 # Allow some height, but not excessively high

             # Eliminate if the drone moves significantly backward (in Y) or too high/low (in Z)
             if (self.position[1] < swarm.start_box_center[1] - swarm.start_box_size/2 - 2 or # Backward from start
                 self.position[2] < -2 or self.position[2] > swarm.area_size/2 + 2): # Below ground or too high
                 self.eliminated = True
                 print(f"Drone {self.id} eliminated due to going out of bounds.")


             # Check if drone reached the end box AFTER updating position
             end_box_min = swarm.end_box_center - swarm.end_box_size / 2.0
             end_box_max = swarm.end_box_center + swarm.end_box_size / 2.0
             # Check if the drone's position is within the bounds of the end box
             if np.all(self.position >= end_box_min) and np.all(self.position <= end_box_max):
                 self.reached_goal = True
                 self.velocity = np.array([0.0, 0.0, 0.0]) # Stop the drone
                 self.time_to_goal = swarm.elapsed_simulation_time # Record time
                 print(f"Drone {self.id} reached the goal at time {self.time_to_goal:.2f} s.")
                 # Update broadcast info upon reaching goal (conceptual)
                 self.broadcast_info = {'id': self.id, 'cost': self.time_to_goal, 'path_length': np.sum([np.linalg.norm(self.path_taken[i+1] - self.path_taken[i]) for i in range(len(self.path_taken)-1)]) if len(self.path_taken) > 1 else 0}


# --- Swarm Class ---
class Swarm:
    def __init__(self, num_drones, start_box_size=5, end_box_size=5, area_size=40): # Increased area size
        self.num_drones = num_drones
        self.start_box_size = start_box_size
        self.end_box_size = end_box_size
        self.area_size = area_size # Overall simulation area size

        # Diagonally opposite start and end boxes
        self.start_box_center = np.array([-area_size/2 + start_box_size/2, -area_size/2 + start_box_size/2, start_box_size/2], dtype=float)
        self.end_box_center = np.array([area_size/2 - end_box_size/2, area_size/2 - end_box_size/2, end_box_size/2], dtype=float)


        self.mode = 'pattern_formation' # Initial mode
        self.obstacles = [] # Obstacles are mode-dependent

        self.drones = [] # Initialize empty, will be populated on reset/start
        # Initialize current_pattern_targets with default values
        self.current_pattern_targets = []

        self.transitioning = False
        self.transition_start_time = 0
        self.transition_duration = 3.0 # Seconds for transition
        self.start_transition_targets = []
        self.end_transition_targets = []

        self.simulation_speed = 1.0 # Factor to control simulation speed
        self.simulation_duration = 30.0 # Default obstacle avoidance simulation duration in seconds (Increased)
        self.elapsed_simulation_time = 0.0 # Track elapsed time within a simulation run

        self.generate_obstacles()


    def get_random_start_position(self):
        # Generate a random position within the start box
        x = np.random.uniform(self.start_box_center[0] - self.start_box_size/2, self.start_box_center[0] + self.start_box_size/2)
        y = np.random.uniform(self.start_box_center[1] - self.start_box_size/2, self.start_box_center[1] + self.start_box_size/2)
        z = np.random.uniform(self.start_box_center[2] - self.start_box_size/2, self.start_box_center[2] + self.start_box_size/2)
        return np.array([x, y, z])

    def generate_obstacles(self):
        self.obstacles = [] # Clear existing obstacles
        if self.mode == 'obstacle_avoidance':
            # Generate pillars for obstacle avoidance maze
            num_rows = 6 # More rows for a longer maze
            num_cols = 5 # More columns
            pillar_height = self.area_size / 2
            pillar_radius = 1.5
            # Adjust spacing based on the larger area and number of rows/cols
            row_spacing = (self.area_size - self.start_box_size - self.end_box_size) / (num_rows + 2) # Add extra space at ends
            col_spacing = self.area_size / (num_cols + 1)

            y_start = self.start_box_center[1] + self.start_box_size/2 + row_spacing

            for r in range(num_rows):
                y = y_start + r * row_spacing
                # Alternate gaps in rows
                gap_col = r % (num_cols + 1) # Which column to leave a gap in (index from 0 to num_cols)

                for c in range(num_cols + 1):
                    x = -self.area_size / 2 + c * col_spacing + col_spacing/2
                    # Add pillar if it's not the gap column
                    if c != gap_col:
                        self.obstacles.append(Pillar([x, y, 0], pillar_height, pillar_radius))

    def generate_pattern_targets(self, pattern_name, size=15): # Increased default size
        targets = []
        active_drones = [d for d in self.drones if not d.eliminated]
        n_active = len(active_drones)

        if n_active == 0:
            return []

        # Center the patterns in the middle of the simulation area, above the ground
        center_point = np.array([0, 0, self.area_size / 4])

        # Use logic similar to the provided FormationControlAlgorithm's compute methods
        if pattern_name == "line":
            line_length = size
            # Ensure targets are generated for the correct number of *active* drones
            targets = np.array([[i, 0, 0] for i in np.linspace(-line_length/2, line_length/2, n_active)])
        elif pattern_name == "circle":
            radius = size / 2.0
            angle_step = 2 * np.pi / n_active if n_active > 0 else 0
            targets = np.array([[radius * np.cos(i * angle_step), radius * np.sin(i * angle_step), 0] for i in range(n_active)])
        elif pattern_name == "square":
            side_length = int(np.ceil(np.sqrt(n_active)))
            spacing = size / (side_length -1 if side_length > 1 else 1) if side_length > 0 else 0
            center_offset = (side_length - 1) * spacing / 2
            targets = np.array([[(i % side_length) * spacing - center_offset, (i // side_length) * spacing - center_offset, 0] for i in range(n_active)])
        elif pattern_name == "star":
            radius = size / 2.0
            inner_radius = radius / 2.5
            points_per_star = 5
            targets = []
            for i in range(n_active):
                 angle_outer = 2 * np.pi * (i % points_per_star) / points_per_star
                 angle_inner = angle_outer + np.pi / points_per_star

                 if i % 2 == 0:
                     x = radius * np.cos(angle_outer)
                     y = radius * np.sin(angle_outer)
                 else:
                     x = inner_radius * np.cos(angle_inner)
                     y = inner_radius * np.sin(angle_inner)
                 z = 0
                 targets.append(np.array([x, y, z]))
            targets = np.array(targets) # Convert list to numpy array

        elif pattern_name == "triangle":
            side_length = size
            height = side_length * np.sqrt(3) / 2
            drones_per_side = n_active // 3 if n_active >= 3 else n_active
            if drones_per_side == 0: drones_per_side = 1

            count = 0
            temp_targets = []
            # Base
            start_x = -side_length / 2
            end_x = side_length / 2
            y = -height / 2
            for i in range(drones_per_side):
                 x = start_x + i * (side_length / (drones_per_side - 1 if drones_per_side > 1 else 1))
                 z = 0
                 if count < n_active: temp_targets.append(np.array([x, y, z])); count += 1

            # Left side
            start_x = -side_length / 2
            start_y = -height / 2
            end_x = 0
            end_y = height / 2
            for i in range(drones_per_side):
                 x = start_x + i * ((end_x - start_x) / (drones_per_side - 1 if drones_per_side > 1 else 1))
                 y_val = start_y + i * ((end_y - start_y) / (drones_per_side - 1 if drones_per_side > 1 else 1))
                 z = 0
                 if count < n_active: temp_targets.append(np.array([x, y_val, z])); count += 1

            # Right side
            start_x = side_length / 2
            start_y = -height / 2
            end_x = 0
            end_y = height / 2
            for i in range(drones_per_side):
                 x = start_x + i * ((end_x - start_x) / (drones_per_side - 1 if drones_per_side > 1 else 1))
                 y_val = start_y + i * ((end_y - start_y) / (drones_per_side - 1 if drones_per_side > 1 else 1))
                 z = 0
                 if count < n_active: temp_targets.append(np.array([x, y_val, z])); count += 1

            while count < n_active:
                 temp_targets.append(np.array([0, 0, 0]))
                 count += 1
            targets = np.array(temp_targets)

        elif pattern_name == "1":
             height = size
             targets = np.array([[0, -height / 2 + i * (height / (n_active - 1 if n_active > 1 else 1)), 0] for i in range(n_active)])

        elif pattern_name == "S":
             length = size
             segments = 3
             points_per_segment = n_active // segments if n_active >= segments else n_active
             if points_per_segment == 0: points_per_segment = 1

             count = 0
             y_start = -length / 2
             segment_length = length / segments
             temp_targets = []

             for s in range(segments):
                 x_offset = (s % 2) * length / 4
                 y_segment_start = y_start + s * segment_length

                 for i in range(points_per_segment):
                     if count < n_active:
                         x = x_offset + (-length/8 if s % 2 == 0 else length/8) * np.sin(i * np.pi / (points_per_segment -1 if points_per_segment > 1 else 1))
                         y = y_segment_start + i * (segment_length / (points_per_segment - 1 if points_per_segment > 1 else 1))
                         z = 0
                         temp_targets.append(np.array([x, y, z]))
                         count += 1

             while count < n_active:
                  temp_targets.append(np.array([0, 0, 0]))
                  count += 1
             targets = np.array(temp_targets)


        else: # Default to random scatter
            targets = np.random.rand(n_active, 3) * size - size/2
            targets[:, 2] = np.random.rand(n_active) * size # Random Z within range

        # Offset targets by the center point
        targets += center_point

        # Assign targets to active drones (simple mapping by current list order)
        final_targets = []
        target_index = 0
        for drone in self.drones:
            if not drone.eliminated:
                if target_index < len(targets):
                    final_targets.append(targets[target_index])
                    target_index += 1
                else:
                    final_targets.append(drone.position.copy()) # Fallback: keep current position
            # Eliminated drones don't get new targets

        return final_targets


    def set_pattern(self, pattern_name, size=15):
        if self.mode != 'pattern_formation':
            print("Pattern setting is only available in Pattern Formation mode.")
            return

        active_drones = [d for d in self.drones if not d.eliminated]
        if not active_drones:
            print("No active drones to set pattern for.")
            return

        new_targets = self.generate_pattern_targets(pattern_name, size)

        # Ensure the number of new targets matches the number of active drones
        while len(new_targets) < len(active_drones):
            new_targets.append(active_drones[-1].position.copy()) # Add a fallback target if needed
        new_targets = new_targets[:len(active_drones)]


        self.start_transition_targets = [drone.target_position.copy() for drone in active_drones]
        self.end_transition_targets = new_targets

        self.transition_start_time = time.time()
        self.transitioning = True

    def update_swarm(self, dt):
        # If the simulation is not running, do nothing
        if not self.gui.running:
             return

        current_time = time.time()
        # Consider only drones that are not eliminated and have not reached the goal for updates
        active_drones = [d for d in self.drones if not d.eliminated and not d.reached_goal]

        if self.mode == 'pattern_formation':
            if self.transitioning:
                elapsed_time = current_time - self.transition_start_time
                transition_progress = min(elapsed_time / self.transition_duration, 1.0)

                # Update target positions for active drones based on transition
                for i, drone in enumerate(active_drones):
                     if i < len(self.start_transition_targets) and i < len(self.end_transition_targets):
                        drone.target_position = self.start_transition_targets[i] + (self.end_transition_targets[i] - self.start_transition_targets[i]) * transition_progress


                if transition_progress >= 1.0:
                    self.transitioning = False
                    target_index = 0
                    for drone in self.drones:
                         if not drone.eliminated:
                              if target_index < len(self.end_transition_targets):
                                   # Find the index of this active drone in the original list
                                   original_index = self.drones.index(drone)
                                   # Ensure current_pattern_targets has enough space if swarm size changed
                                   while original_index >= len(self.current_pattern_targets):
                                        self.current_pattern_targets.append(np.array([0.0, 0.0, 0.0])) # Pad with default if needed
                                   self.current_pattern_targets[original_index] = self.end_transition_targets[target_index].copy()
                                   target_index += 1


            else:
                 target_index = 0
                 for drone in self.drones:
                      if not drone.eliminated:
                           if target_index < len(self.current_pattern_targets):
                                # Find the index of this active drone in the original list
                                original_index = self.drones.index(drone)
                                # Ensure current_pattern_targets has enough space if swarm size changed
                                while original_index >= len(self.current_pattern_targets):
                                     self.current_pattern_targets.append(np.array([0.0, 0.0, 0.0])) # Pad with default if needed
                                drone.target_position = self.current_pattern_targets[original_index].copy()
                                target_index += 1
                           else:
                                pass
        for drone in active_drones:
            drone.update(dt, self)

        # Check for collisions and eliminate/goal reach ONLY in Obstacle Avoidance mode
        if self.mode == 'obstacle_avoidance':
            self.elapsed_simulation_time += dt # Increment elapsed time
            drones_to_keep = []
            eliminated_count = 0
            reached_count = 0
            for drone in self.drones:
                if not drone.eliminated and not drone.reached_goal:
                    collided = False
                    for obstacle in self.obstacles:
                        if obstacle.is_inside(drone.position):
                            drone.eliminated = True
                            collided = True
                            eliminated_count += 1
                            # print(f"Drone {drone.id} eliminated by collision.") # Printed in Drone.update now
                            break # Drone collided with one obstacle, no need to check others
                    if not collided:
                        drones_to_keep.append(drone)
                elif drone.reached_goal:
                    drones_to_keep.append(drone) # Keep drones that reached the goal
                    reached_count += 1
                elif drone.eliminated:
                     pass # Do not add eliminated drones to drones_to_keep

            self.drones = drones_to_keep # Update the list of drones

            # Check if the current simulation run should end
            if self.elapsed_simulation_time >= self.simulation_duration or (len(self.drones) == reached_count + eliminated_count and self.num_drones > 0):
                 self.gui.end_simulation_run() # Signal the GUI that a run is finished


    def resize_swarm(self, new_num_drones):
        self.num_drones = new_num_drones
        # Create new drones, resetting state
        self.drones = [Drone(i, self.get_random_start_position()) for i in range(self.num_drones)]

        # Reset pattern targets based on the new swarm size and current mode
        if self.mode == 'pattern_formation':
             if hasattr(self, 'gui') and self.gui:
                  self.current_pattern_targets = self.generate_pattern_targets(self.gui.pattern_var.get())
             else:
                  self.current_pattern_targets = [drone.position.copy() for drone in self.drones] # Default targets
        else:
             # In obstacle avoidance mode, individual pattern targets are not used for movement
             self.current_pattern_targets = [drone.position.copy() for drone in self.drones] # Still need a list for compatibility

        self.transitioning = False # Stop any ongoing transition


    def set_mode(self, mode):
        if mode not in ['pattern_formation', 'obstacle_avoidance']:
            print(f"Invalid mode: {mode}")
            return

        self.mode = mode
        self.generate_obstacles() # Regenerate obstacles based on the new mode
        self.reset_swarm() # Reset drones to start positions when changing mode
        print(f"Switched to {mode} mode.")
        # Update info label based on the new mode
        if self.mode == 'pattern_formation':
             self.gui.info_label.config(text="Pattern Formation Mode")
        else:
             # Clear info label initially in avoidance mode, it will be updated during the run
             self.gui.info_label.config(text="Obstacle Avoidance Mode\nReady to start.")


    def reset_swarm(self):
         # Reset all drones to start positions and clear elimination/goal status
         self.drones = [Drone(i, self.get_random_start_position()) for i in range(self.num_drones)]
         # Reset pattern targets for the new set of drones
         if self.mode == 'pattern_formation':
              if hasattr(self, 'gui') and self.gui:
                   self.current_pattern_targets = self.generate_pattern_targets(self.gui.pattern_var.get())
              else:
                   self.current_pattern_targets = [drone.position.copy() for drone in self.drones] # Default targets
         else:
              # In obstacle avoidance mode, individual pattern targets are not used
              self.current_pattern_targets = [drone.position.copy() for drone in self.drones] # Still need a list for compatibility

         self.transitioning = False # Stop any ongoing transition
         self.elapsed_simulation_time = 0.0 # Reset elapsed time on swarm reset


    def calculate_run_results(self):
        """Calculates results for a single obstacle avoidance simulation run."""
        successful_drones = [d for d in self.drones if d.reached_goal]
        num_successful = len(successful_drones)
        total_initial_drones = self.num_drones # Use the initial number of drones

        success_percentage = (num_successful / total_initial_drones) * 100 if total_initial_drones > 0 else 0
        num_eliminated = total_initial_drones - num_successful - len([d for d in self.drones if d.reached_goal]) # Account for those that reached goal

        average_time = 0.0
        if num_successful > 0:
            times = [d.time_to_goal for d in successful_drones]
            average_time = np.mean(times)

        print(f"Simulation Run Finished: Successful Drones: {num_successful}/{total_initial_drones} ({success_percentage:.2f}%), Eliminated: {num_eliminated}, Average Time (Successful): {average_time:.2f} s")
        return num_successful, num_eliminated, success_percentage, average_time


# --- GUI and Simulation Control ---
class SimulatorGUI:
    def __init__(self, master):
        self.master = master
        master.title("Drone Swarm Simulator")

        self.swarm = Swarm(num_drones=20) # Initial number of drones
        self.swarm.gui = self # Give swarm a reference to the GUI for pattern regeneration on reset
        self.running = False
        self.simulation_thread = None

        # --- GUI Layout ---
        self.control_frame = ttk.Frame(master)
        self.control_frame.pack(side=tk.LEFT, padx=10, pady=10, fill=tk.Y)

        # Simulation Mode Selection
        ttk.Label(self.control_frame, text="Simulation Mode:").pack(pady=5)
        self.mode_var = tk.StringVar(value=self.swarm.mode)
        self.pattern_mode_radio = ttk.Radiobutton(self.control_frame, text="Pattern Formation", variable=self.mode_var, value='pattern_formation', command=self.change_mode)
        self.pattern_mode_radio.pack(pady=2)
        self.avoidance_mode_radio = ttk.Radiobutton(self.control_frame, text="Obstacle Avoidance", variable=self.mode_var, value='obstacle_avoidance', command=self.change_mode)
        self.avoidance_mode_radio.pack(pady=2)

        # Number of Drones
        ttk.Label(self.control_frame, text="Number of Drones:").pack(pady=5)
        self.num_drones_var = tk.IntVar(value=self.swarm.num_drones)
        self.num_drones_entry = ttk.Entry(self.control_frame, textvariable=self.num_drones_var)
        self.num_drones_entry.pack(pady=5)
        self.num_drones_entry.bind("<Return>", self.update_num_drones)

        # Pattern Selection (Visibility controlled by mode)
        self.pattern_frame = ttk.Frame(self.control_frame)
        self.pattern_frame.pack(pady=10)
        ttk.Label(self.pattern_frame, text="Select Pattern:").pack(pady=5)
        self.pattern_var = tk.StringVar()
        self.pattern_dropdown = ttk.Combobox(self.pattern_frame, textvariable=self.pattern_var,
                                             values=["circle", "star", "line", "square", "triangle", "1", "S"])
        self.pattern_dropdown.pack(pady=5)
        self.pattern_dropdown.set("circle") # Default pattern
        self.pattern_dropdown.bind("<<ComboboxSelected>>", self.change_pattern)

        # Obstacle Avoidance Settings (Visibility controlled by mode)
        self.avoidance_settings_frame = ttk.Frame(self.control_frame)
        # PID Gain Controls for Obstacle Avoidance
        ttk.Label(self.avoidance_settings_frame, text="PID Gains:").pack(pady=5)

        ttk.Label(self.avoidance_settings_frame, text="Kp:").pack(pady=2)
        self.kp_var = tk.DoubleVar(value=self.swarm.drones[0].Kp_pid if self.swarm.drones else 0.8) # Default from Drone class
        self.kp_entry = ttk.Entry(self.avoidance_settings_frame, textvariable=self.kp_var)
        self.kp_entry.pack(pady=2)
        self.kp_entry.bind("<Return>", self.update_pid_gains)

        ttk.Label(self.avoidance_settings_frame, text="Ki:").pack(pady=2)
        self.ki_var = tk.DoubleVar(value=self.swarm.drones[0].Ki_pid if self.swarm.drones else 0.01) # Default from Drone class
        self.ki_entry = ttk.Entry(self.avoidance_settings_frame, textvariable=self.ki_var)
        self.ki_entry.pack(pady=2)
        self.ki_entry.bind("<Return>", self.update_pid_gains)

        ttk.Label(self.avoidance_settings_frame, text="Kd:").pack(pady=2)
        self.kd_var = tk.DoubleVar(value=self.swarm.drones[0].Kd_pid if self.swarm.drones else 0.5) # Default from Drone class
        self.kd_entry = ttk.Entry(self.avoidance_settings_frame, textvariable=self.kd_var)
        self.kd_entry.pack(pady=2)
        self.kd_entry.bind("<Return>", self.update_pid_gains)

        ttk.Label(self.avoidance_settings_frame, text="Simulation Duration (s):").pack(pady=5)
        self.sim_duration_var = tk.DoubleVar(value=self.swarm.simulation_duration)
        self.sim_duration_entry = ttk.Entry(self.avoidance_settings_frame, textvariable=self.sim_duration_var)
        self.sim_duration_entry.pack(pady=5)
        self.sim_duration_entry.bind("<Return>", self.update_sim_duration)

        # Simulation Speed Control
        ttk.Label(self.control_frame, text="Simulation Speed:").pack(pady=5)
        self.speed_var = tk.DoubleVar(value=1.0)
        self.speed_slider = ttk.Scale(self.control_frame, from_=0.1, to=5.0, orient=tk.HORIZONTAL, variable=self.speed_var) # Increased max speed range
        self.speed_slider.pack(pady=5)
        self.speed_slider.bind("<Motion>", self.update_speed)

        # Simulation Controls
        self.start_button = ttk.Button(self.control_frame, text="Start Simulation", command=self.start_simulation)
        self.start_button.pack(pady=10)

        self.stop_button = ttk.Button(self.control_frame, text="Stop Simulation", command=self.stop_simulation, state=tk.DISABLED)
        self.stop_button.pack(pady=5)

        # Simulation Info Display
        self.info_label = ttk.Label(self.control_frame, text="")
        self.info_label.pack(pady=10)

        # Matplotlib Figure and Canvas for Swarm Visualization (Now on the right)
        self.figure_swarm = plt.Figure(figsize=(8, 6), dpi=100)
        self.ax_swarm = self.figure_swarm.add_subplot(111, projection='3d')
        self.canvas_swarm = FigureCanvasTkAgg(self.figure_swarm, master=master)
        self.canvas_widget_swarm = self.canvas_swarm.get_tk_widget()
        self.canvas_widget_swarm.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=10) # Packed on the right

        self.update_ui_based_on_mode()
        self.plot_swarm()


    def change_mode(self):
        selected_mode = self.mode_var.get()
        self.swarm.set_mode(selected_mode)
        self.update_ui_based_on_mode()
        self.plot_swarm() # Update swarm plot immediately after changing mode


    def update_ui_based_on_mode(self):
        if self.swarm.mode == 'pattern_formation':
            self.pattern_frame.pack(pady=10) # Show pattern controls
            self.avoidance_settings_frame.pack_forget() # Hide avoidance settings
            self.canvas_widget_swarm.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=10) # Swarm on right in pattern mode
            self.info_label.config(text="Pattern Formation Mode") # Set info label text
        else: # Obstacle Avoidance mode
            self.pattern_frame.pack_forget() # Hide pattern controls
            self.avoidance_settings_frame.pack(pady=10) # Show avoidance settings
            self.canvas_widget_swarm.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=10) # Swarm on right in avoidance mode (Keeping on right as per last request)
            self.info_label.config(text="Obstacle Avoidance Mode\nReady to start.") # Set info label text


    def update_num_drones(self, event=None):
        try:
            new_num = self.num_drones_var.get()
            if new_num >= 0: # Allow 0 drones
                self.swarm.resize_swarm(new_num)
                self.plot_swarm()
        except ValueError:
            print("Invalid number of drones")

    def update_sim_duration(self, event=None):
        try:
            new_duration = self.sim_duration_var.get()
            if new_duration > 0:
                self.swarm.simulation_duration = new_duration
        except ValueError:
            print("Invalid simulation duration")


    def change_pattern(self, event=None):
        selected_pattern = self.pattern_var.get()
        self.swarm.set_pattern(selected_pattern)

    def update_speed(self, event=None):
        self.swarm.simulation_speed = self.speed_slider.get()

    def plot_swarm(self):
        self.ax_swarm.cla() # Clear previous plot

        # Plot active drones
        active_drones = [d for d in self.swarm.drones if not d.eliminated and not d.reached_goal]
        if active_drones:
            x = [drone.position[0] for drone in active_drones]
            y = [drone.position[1] for drone in active_drones]
            z = [drone.position[2] for drone in active_drones]
            self.ax_swarm.scatter(x, y, z, marker='o', c='b', label=f'Drones ({len(active_drones)} active)')

        # Plot drones that reached the goal
        reached_drones = [d for d in self.swarm.drones if d.reached_goal]
        if reached_drones:
            x_r = [drone.position[0] for drone in reached_drones]
            y_r = [drone.position[1] for drone in reached_drones]
            z_r = [drone.position[2] for drone in reached_drones]
            self.ax_swarm.scatter(x_r, y_r, z_r, marker='*', c='g', s=100, label=f'Reached Goal ({len(reached_drones)})')

        # Plot eliminated drones (optional, for debugging)
        eliminated_drones = [d for d in self.swarm.drones if d.eliminated]
        if eliminated_drones:
             x_e = [drone.position[0] for drone in eliminated_drones]
             y_e = [drone.position[1] for drone in eliminated_drones]
             z_e = [drone.position[2] for drone in eliminated_drones]
             self.ax_swarm.scatter(x_e, y_e, z_e, marker='x', c='r', s=50, label=f'Eliminated ({len(eliminated_drones)})')


        # Plot elements based on mode
        if self.swarm.mode == 'obstacle_avoidance':
            # Plot pillars
            for pillar in self.swarm.obstacles:
                theta = np.linspace(0, 2*np.pi, 10) # Further reduced points for potentially better performance
                z_cyl = np.linspace(pillar.base_position[2], pillar.base_position[2] + pillar.height, 2) # Only two points along height
                Z, THETA = np.meshgrid(z_cyl, theta)
                X = pillar.base_position[0] + pillar.radius * np.cos(THETA)
                Y = pillar.base_position[1] + pillar.radius * np.sin(THETA)
                self.ax_swarm.plot_surface(X, Y, Z, color='gray', alpha=0.6, rstride=1, cstride=1)

            # Plot start box (wireframe)
            start_size = self.swarm.start_box_size
            sb_center = self.swarm.start_box_center
            x_start = [sb_center[0]-start_size/2, sb_center[0]+start_size/2, sb_center[0]+start_size/2, sb_center[0]-start_size/2, sb_center[0]-start_size/2]
            y_start = [sb_center[1]-start_size/2, sb_center[1]-start_size/2, sb_center[1]+start_size/2, sb_center[1]+start_size/2, sb_center[1]-start_size/2]
            z_bottom = [sb_center[2]-start_size/2, sb_center[2]-start_size/2, sb_center[2]-start_size/2, sb_center[2]-start_size/2, sb_center[2]-start_size/2]
            z_top = [sb_center[2]+start_size/2, sb_center[2]+start_size/2, sb_center[2]+start_size/2, sb_center[2]+start_size/2, sb_center[2]+start_size/2]
            self.ax_swarm.plot(x_start, y_start, z_bottom, color='green', linestyle='--', label='Start Box')
            self.ax_swarm.plot(x_start, y_start, z_top, color='green', linestyle='--')
            self.ax_swarm.plot([x_start[0], x_start[0]], [y_start[0], y_start[0]], [z_bottom[0], z_top[0]], color='green', linestyle='--')
            self.ax_swarm.plot([x_start[1], x_start[1]], [y_start[1], y_start[1]], [z_bottom[1], z_top[1]], color='green', linestyle='--')
            self.ax_swarm.plot([x_start[2], x_start[2]], [y_start[2], y_start[2]], [z_bottom[2], z_top[2]], color='green', linestyle='--')
            self.ax_swarm.plot([x_start[3], x_start[3]], [y_start[3], y_start[3]], [z_bottom[3], z_top[3]], color='green', linestyle='--')

            # Plot end box (wireframe)
            end_size = self.swarm.end_box_size
            eb_center = self.swarm.end_box_center
            x_end = [eb_center[0]-end_size/2, eb_center[0]+end_size/2, eb_center[0]+end_size/2, eb_center[0]-end_size/2, eb_center[0]-end_size/2]
            y_end = [eb_center[1]-end_size/2, eb_center[1]-end_size/2, eb_center[1]+end_size/2, eb_center[1]+end_size/2, eb_center[1]-end_size/2]
            z_bottom_end = [eb_center[2]-end_size/2, eb_center[2]-end_size/2, eb_center[2]-end_size/2, eb_center[2]-end_size/2, eb_center[2]-end_size/2]
            z_top_end = [eb_center[2]+end_size/2, eb_center[2]+end_size/2, eb_center[2]+end_size/2, eb_center[2]+end_size/2, eb_center[2]+end_size/2]
            self.ax_swarm.plot(x_end, y_end, z_bottom_end, color='red', linestyle='--', label='End Box')
            self.ax_swarm.plot(x_end, y_end, z_top_end, color='red', linestyle='--')
            self.ax_swarm.plot([x_end[0], x_end[0]], [y_end[0], y_end[0]], [z_bottom_end[0], z_top_end[0]], color='red', linestyle='--')
            self.ax_swarm.plot([x_end[1], x_end[1]], [y_end[1], y_end[1]], [z_bottom_end[1], z_top_end[1]], color='red', linestyle='--')
            self.ax_swarm.plot([x_end[2], x_end[2]], [y_end[2], y_end[2]], [z_bottom_end[2], z_top_end[2]], color='red', linestyle='--')
            self.ax_swarm.plot([x_end[3], x_end[3]], [y_end[3], y_end[3]], [z_bottom_end[3], z_top_end[3]], color='red', linestyle='--')


        # Set plot limits and labels
        plot_range = self.swarm.area_size / 2
        self.ax_swarm.set_xlim([-plot_range, plot_range])
        self.ax_swarm.set_ylim([-plot_range, plot_range])
        # Adjust Z limits based on pillar height and pattern height
        max_z = max(self.swarm.area_size / 4 + 15/2 + 5, self.swarm.area_size / 2 + 5) # Max of pattern height + offset + buffer or pillar height + buffer
        self.ax_swarm.set_zlim([0, max_z])
        self.ax_swarm.set_xlabel('X')
        self.ax_swarm.set_ylabel('Y')
        self.ax_swarm.set_zlabel('Z')
        self.ax_swarm.set_title(f"Drone Swarm Simulation ({self.swarm.mode.replace('_', ' ').title()} Mode)")
        # Only show legend if there are labels to show
        if self.ax_swarm.get_legend_handles_labels()[1]:
            self.ax_swarm.legend()
        self.canvas_swarm.draw()


    def simulation_loop(self):
        base_dt = 0.05 # Base time step for simulation physics

        while self.running:
            start_time = time.time()
            dt = base_dt * self.swarm.simulation_speed # Actual time step considering speed slider
            self.swarm.update_swarm(dt)
            if self.swarm.drones:
                 self.master.after(1, self.plot_swarm) # Schedule plot update


            end_time = time.time()
            elapsed_frame_time = end_time - start_time
            sleep_time = base_dt - elapsed_frame_time
            if sleep_time > 0:
                time.sleep(sleep_time / self.swarm.simulation_speed) # Scale sleep time by simulation speed


    def start_simulation(self):
        if not self.running:
            self.running = True
            self.start_button.config(state=tk.DISABLED)
            self.stop_button.config(state=tk.NORMAL)

            # Reset swarm state for the new run
            self.swarm.reset_swarm()
            self.plot_swarm() # Plot initial state

            # Start the simulation loop thread if it's not already running
            if self.simulation_thread is None or not self.simulation_thread.is_alive():
                 self.simulation_thread = threading.Thread(target=self.simulation_loop)
                 self.simulation_thread.daemon = True
                 self.simulation_thread.start()

            if self.swarm.mode == 'obstacle_avoidance':
                 self.info_label.config(text=f"Obstacle Avoidance Mode\nRunning...")
            else:
                 self.info_label.config(text=f"Pattern Formation Mode\nRunning...")


    def end_simulation_run(self):
        """Called by Swarm when an obstacle avoidance simulation run finishes."""
        if self.swarm.mode == 'obstacle_avoidance':
            num_successful, num_eliminated, success_percentage, average_time = self.swarm.calculate_run_results()

            self.info_label.config(text=f"Obstacle Avoidance Mode\nRun Finished:\n"
                                       f"Successful: {num_successful}/{self.swarm.num_drones} ({success_percentage:.2f}%)\n"
                                       f"Eliminated: {num_eliminated}\n"
                                       f"Avg Time (Successful): {average_time:.2f} s")

            self.running = False # Stop the simulation loop
            self.start_button.config(state=tk.NORMAL)
            self.stop_button.config(state=tk.DISABLED)
            print("Simulation run finished.")


    def stop_simulation(self):
        if self.running:
            self.running = False
            self.start_button.config(state=tk.NORMAL)
            self.stop_button.config(state=tk.DISABLED)
            print("Simulation stopped manually.")
            # Update info label
            if self.swarm.mode == 'obstacle_avoidance':
                 self.info_label.config(text="Obstacle Avoidance Mode\nSimulation stopped.")
            else:
                 self.info_label.config(text="Pattern Formation Mode\nSimulation stopped.")

    def update_pid_gains(self, event=None):
        try:
            new_kp = self.kp_var.get()
            new_ki = self.ki_var.get()
            new_kd = self.kd_var.get()
            if new_kp >= 0 and new_ki >= 0 and new_kd >= 0:
                for drone in self.swarm.drones:
                    drone.Kp_pid = new_kp
                    drone.Ki_pid = new_ki
                    drone.Kd_pid = new_kd
                print(f"Updated PID gains: Kp={new_kp}, Ki={new_ki}, Kd={new_kd}")
        except ValueError:
            print("Invalid PID gain value")


# --- Main Execution ---
if __name__ == "__main__":
    root = tk.Tk()
    gui = SimulatorGUI(root)
    root.protocol("WM_DELETE_WINDOW", root.quit)
    root.mainloop()
