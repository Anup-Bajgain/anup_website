def calculate_avoidance_force(self, swarm, obstacles):
    avoidance_force = np.array([0.0, 0.0, 0.0])
    swarm_center = np.zeros(3)
    neighbor_count = 0
    
    # Boids implementation
    for other_drone in swarm.drones:
        dist = np.linalg.norm(self.position - other_drone.position)
        if dist < self.avoidance_radius:
            swarm_center += other_drone.position
            neighbor_count += 1
            avoidance_force += (self.position - other_drone.position)/dist**2  # Separation
            
    if neighbor_count > 0:
        cohesion_force = (swarm_center/neighbor_count - self.position) * 0.1  # Cohesion
        alignment_force = (np.mean([d.velocity for d in neighbors], axis=0) - self.velocity) * 0.1  # Alignment